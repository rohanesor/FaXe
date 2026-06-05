/* eslint-disable no-bitwise */
import CryptoJS from 'crypto-js';
import { keyManager } from './KeyManager';

/**
 * Custom error class for encryption/decryption operations.
 */
export class CipherError extends Error {
  public code: 'AUTH_TAG_MISMATCH' | 'INVALID_BLOB' | 'DECRYPTION_FAILED' | 'ENCRYPTION_FAILED';

  constructor(
    code: 'AUTH_TAG_MISMATCH' | 'INVALID_BLOB' | 'DECRYPTION_FAILED' | 'ENCRYPTION_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'CipherError';
    this.code = code;
  }
}

// ============================================================================
// MANUAL HKDF IMPLEMENTATION (RFC 5869)
// ============================================================================

/**
 * Derives a 256-bit AES key for a specific user using HKDF with HMAC-SHA256.
 * 
 * Math / Algorithm logic:
 * 1. Extract: PRK = HMAC-SHA256(salt=userId, IKM=masterKey)
 * 2. Expand: T(1) = HMAC-SHA256(PRK, info='embedding' || 0x01)
 *    Since L = 32 bytes (256 bits) matches the output length of HMAC-SHA256 (32 bytes),
 *    we only need to compute the first block T(1) of the expand phase.
 */
export function hkdfDeriveKey(masterKeyHex: string, userId: string, info: string = 'embedding'): string {
  const ikm = CryptoJS.enc.Hex.parse(masterKeyHex);
  const salt = CryptoJS.enc.Utf8.parse(userId);
  const infoWA = CryptoJS.enc.Utf8.parse(info);

  // Extract PRK
  const prk = CryptoJS.HmacSHA256(ikm, salt);

  // Expand: append 0x01 byte to info
  const suffix = CryptoJS.enc.Hex.parse('01');
  const infoPlusSuffix = infoWA.clone().concat(suffix);
  const derived = CryptoJS.HmacSHA256(infoPlusSuffix, prk);

  return CryptoJS.enc.Hex.stringify(derived);
}

// ============================================================================
// AES-GCM ARITHMETIC & GALOIS FIELD GF(2^128) MULTIPLIER
// ============================================================================

/**
 * Multiplies two 128-bit blocks in the Galois Field GF(2^128) using standard GCM parameters.
 * Reducing polynomial: f(x) = x^128 + x^7 + x^2 + x + 1.
 * Represented in binary-reflected form: reduction constant 0xE1000000000000000000000000000000.
 */
function gfMultiply(x: Uint8Array, y: Uint8Array): Uint8Array {
  const z = new Uint8Array(16);
  const v = new Uint8Array(y);

  for (let i = 0; i < 128; i++) {
    const byteIdx = Math.floor(i / 8);
    const bitIdx = 7 - (i % 8);
    
    // If the i-th bit of x is 1, XOR z with v
    if ((x[byteIdx] & (1 << bitIdx)) !== 0) {
      for (let j = 0; j < 16; j++) {
        z[j] ^= v[j];
      }
    }

    // Shift v right by 1 bit in GF(2^128)
    let carry = 0;
    for (let j = 0; j < 16; j++) {
      const nextCarry = v[j] & 1;
      v[j] = (v[j] >>> 1) | (carry << 7);
      carry = nextCarry;
    }

    // If the shifted-out bit is 1, XOR with the reduction polynomial
    if (carry !== 0) {
      v[0] ^= 0xe1;
    }
  }

  return z;
}

/**
 * Computes the GHASH of the ciphertext padded to 16-byte blocks,
 * followed by the bit-length block representing the size of the ciphertext.
 */
function computeGHash(ciphertext: Uint8Array, hashKey: Uint8Array): Uint8Array {
  let y: any = new Uint8Array(16);

  // 1. Process ciphertext blocks (padded to 16 bytes)
  const numBlocks = Math.ceil(ciphertext.length / 16);
  for (let b = 0; b < numBlocks; b++) {
    const block = new Uint8Array(16);
    const start = b * 16;
    const end = Math.min(start + 16, ciphertext.length);
    block.set(ciphertext.subarray(start, end));

    // Y_i = gfMultiply(Y_{i-1} ^ Block_i, H)
    for (let i = 0; i < 16; i++) {
      y[i] ^= block[i];
    }
    y = gfMultiply(y, hashKey);
  }

  // 2. Process lengths block [Len(A) in bits (64-bit) | Len(C) in bits (64-bit)]
  // Since we do not use Associated Authenticated Data (AAD) in our database blobs, AAD length is 0.
  const lengthsBlock = new Uint8Array(16);
  const bitLengthC = ciphertext.length * 8;

  // Split 64-bit length into two 32-bit integers to support 32-bit JS bitwise operators
  const high = Math.floor(bitLengthC / 0x100000000);
  const low = bitLengthC % 0x100000000;

  lengthsBlock[8] = (high >>> 24) & 0xff;
  lengthsBlock[9] = (high >>> 16) & 0xff;
  lengthsBlock[10] = (high >>> 8) & 0xff;
  lengthsBlock[11] = high & 0xff;

  lengthsBlock[12] = (low >>> 24) & 0xff;
  lengthsBlock[13] = (low >>> 16) & 0xff;
  lengthsBlock[14] = (low >>> 8) & 0xff;
  lengthsBlock[15] = low & 0xff;

  for (let i = 0; i < 16; i++) {
    y[i] ^= lengthsBlock[i];
  }
  y = gfMultiply(y, hashKey);

  return y;
}

/**
 * Encrypts a single 16-byte block using CryptoJS raw AES block encryption in ECB/NoPadding mode.
 */
function aesEncryptBlock(block: Uint8Array, keyWA: CryptoJS.lib.WordArray): Uint8Array {
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    words.push(
      (block[i * 4] << 24) |
      (block[i * 4 + 1] << 16) |
      (block[i * 4 + 2] << 8) |
      block[i * 4 + 3]
    );
  }
  const blockWA = CryptoJS.lib.WordArray.create(words, 16);

  const encryptor = CryptoJS.algo.AES.createEncryptor(keyWA, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.NoPadding,
  });
  
  // Use finalize to ensure the block is immediately and fully processed
  const encryptedWA = encryptor.finalize(blockWA);

  const outBytes = new Uint8Array(16);
  for (let i = 0; i < 4; i++) {
    const w = encryptedWA.words[i];
    outBytes[i * 4] = (w >>> 24) & 0xff;
    outBytes[i * 4 + 1] = (w >>> 16) & 0xff;
    outBytes[i * 4 + 2] = (w >>> 8) & 0xff;
    outBytes[i * 4 + 3] = w & 0xff;
  }
  return outBytes;
}

// ============================================================================
// CIPHER API EXPORTS
// ============================================================================

/**
 * Encrypts a 512-byte or 768-byte embedding vector using AES-256-GCM.
 * Generates a random 12-byte IV per invocation.
 * Output format: [IV (12 bytes) | Ciphertext (length bytes) | Auth Tag (16 bytes)]
 */
export async function encrypt(userId: string, embedding: Uint8Array): Promise<Uint8Array> {
  if (embedding.length !== 512 && embedding.length !== 768) {
    throw new CipherError('ENCRYPTION_FAILED', `Invalid embedding size: expected 512 or 768 bytes, got ${embedding.length}`);
  }

  const length = embedding.length;

  try {
    const masterKeyHex = keyManager.getMasterKeySync();
    
    // 1. Derive per-user key
    const derivedKeyHex = hkdfDeriveKey(masterKeyHex, userId);
    const keyWA = CryptoJS.enc.Hex.parse(derivedKeyHex);

    // 2. Generate random 12-byte IV
    const iv = new Uint8Array(12);
    const cryptoObj = (globalThis as any).crypto;
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      cryptoObj.getRandomValues(iv);
    } else {
      // Fallback pseudo-random for absolute safety
      for (let i = 0; i < 12; i++) {
        iv[i] = Math.floor(Math.random() * 256);
      }
    }

    // 3. Compute hash subkey H = AES_K(0^16)
    const zeroBlock = new Uint8Array(16);
    const hashKey = aesEncryptBlock(zeroBlock, keyWA);

    // 4. Perform AES-CTR encryption
    const ciphertext = new Uint8Array(length);
    const numBlocks = length / 16;

    for (let b = 0; b < numBlocks; b++) {
      // Counter block CB_i = [ IV (12 bytes) | Counter (4 bytes big-endian) ]
      const cb = new Uint8Array(16);
      cb.set(iv, 0);
      const counterVal = b + 2; // Counter 1 is reserved for authentication tag XOR (J0)
      cb[12] = (counterVal >>> 24) & 0xff;
      cb[13] = (counterVal >>> 16) & 0xff;
      cb[14] = (counterVal >>> 8) & 0xff;
      cb[15] = counterVal & 0xff;

      const keystream = aesEncryptBlock(cb, keyWA);
      const start = b * 16;
      for (let i = 0; i < 16; i++) {
        ciphertext[start + i] = embedding[start + i] ^ keystream[i];
      }
    }

    // 5. Compute Galois Hash (GHASH)
    const ghash = computeGHash(ciphertext, hashKey);

    // 6. Generate final authentication Tag via J_0 counter 1
    const cb0 = new Uint8Array(16);
    cb0.set(iv, 0);
    cb0[15] = 1;
    const ks0 = aesEncryptBlock(cb0, keyWA);

    const tag = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      tag[i] = ghash[i] ^ ks0[i];
    }

    // 7. Package output [IV (12B) | Ciphertext (length B) | Tag (16B)]
    const packaged = new Uint8Array(12 + length + 16);
    packaged.set(iv, 0);
    packaged.set(ciphertext, 12);
    packaged.set(tag, 12 + length);

    return packaged;
  } catch (error: any) {
    throw new CipherError('ENCRYPTION_FAILED', `Encryption pipeline failure: ${error.message || error}`);
  }
}

/**
 * Decrypts and authenticates a binary blob using AES-256-GCM.
 * Validates the authentication tag. Throws AUTH_TAG_MISMATCH if tampered with.
 */
export async function decrypt(userId: string, blob: Uint8Array): Promise<Uint8Array> {
  // Legacy passthrough: if blob is exactly 512 or 768 bytes, it's an unencrypted raw Float32Array
  if (blob.length === 512 || blob.length === 768) {
    console.log(`[EmbeddingCipher] Legacy ${blob.length}-byte unencrypted embedding detected for user ${userId}, returning raw.`);
    return blob;
  }

  if (blob.length < 28) {
    throw new CipherError('INVALID_BLOB', `Blob too short: minimum 28 bytes (12 IV + 16 tag), got ${blob.length}`);
  }

  const length = blob.length - 28;
  if (length !== 512 && length !== 768) {
    throw new CipherError('INVALID_BLOB', `Invalid encrypted blob length: expected 540 or 796 bytes, got ${blob.length}`);
  }

  try {
    const masterKeyHex = keyManager.getMasterKeySync();
    
    // 1. Derive per-user key
    const derivedKeyHex = hkdfDeriveKey(masterKeyHex, userId);
    const keyWA = CryptoJS.enc.Hex.parse(derivedKeyHex);

    // 2. Unpack blob [IV (12B) | Ciphertext (length B) | Tag (16B)]
    const iv = blob.subarray(0, 12);
    const ciphertext = blob.subarray(12, 12 + length);
    const tag = blob.subarray(12 + length, 12 + length + 16);

    // 3. Compute hash subkey H = AES_K(0^16)
    const zeroBlock = new Uint8Array(16);
    const hashKey = aesEncryptBlock(zeroBlock, keyWA);

    // 4. Compute expected GHASH of ciphertext
    const ghash = computeGHash(ciphertext, hashKey);

    // 5. Generate final tag key (J_0 counter 1)
    const cb0 = new Uint8Array(16);
    cb0.set(iv, 0);
    cb0[15] = 1;
    const ks0 = aesEncryptBlock(cb0, keyWA);

    // 6. Verify authentication Tag integrity
    let authenticated = true;
    for (let i = 0; i < 16; i++) {
      const expectedTagByte = ghash[i] ^ ks0[i];
      if (tag[i] !== expectedTagByte) {
        authenticated = false;
      }
    }

    if (!authenticated) {
      throw new CipherError('AUTH_TAG_MISMATCH', 'Cryptographic authenticity check failed. Ciphertext has been modified.');
    }

    // 7. Perform AES-CTR decryption (identical XOR transform)
    const plaintext = new Uint8Array(length);
    const numBlocks = length / 16;

    for (let b = 0; b < numBlocks; b++) {
      const cb = new Uint8Array(16);
      cb.set(iv, 0);
      const counterVal = b + 2;
      cb[12] = (counterVal >>> 24) & 0xff;
      cb[13] = (counterVal >>> 16) & 0xff;
      cb[14] = (counterVal >>> 8) & 0xff;
      cb[15] = counterVal & 0xff;

      const keystream = aesEncryptBlock(cb, keyWA);
      const start = b * 16;
      for (let i = 0; i < 16; i++) {
        plaintext[start + i] = ciphertext[start + i] ^ keystream[i];
      }
    }

    return plaintext;
  } catch (error: any) {
    if (error instanceof CipherError) {
      throw error;
    }
    throw new CipherError('DECRYPTION_FAILED', `Decryption pipeline failure: ${error.message || error}`);
  }
}

/**
 * Safe wrapper around decrypt that catches all exceptions and returns null.
 * Use this when iterating over multiple embeddings — a single corrupt blob
 * should not kill the entire batch.
 */
export async function safeDecrypt(userId: string, blob: Uint8Array): Promise<Uint8Array | null> {
  try {
    return await decrypt(userId, blob);
  } catch (error: any) {
    console.error(`[EmbeddingCipher] safeDecrypt failed for user ${userId}: ${error.message || error}`);
    return null;
  }
}
