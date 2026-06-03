import CryptoJS from 'crypto-js';
import { keyManager } from './KeyManager';

/**
 * Encrypts a sensitive string field (e.g., name or role) using the master key directly with AES-256-CBC.
 * Returns a composite string formatted as "ivBase64:ciphertextBase64" suitable for SQLite TEXT columns.
 */
export function encryptField(value: string): string {
  if (!value) {
    return '';
  }

  try {
    // 1. Fetch cached master key from KeyManager
    const masterKeyHex = keyManager.getMasterKeySync();
    const keyWA = CryptoJS.enc.Hex.parse(masterKeyHex);

    // 2. Generate random 16-byte IV (standard for AES-CBC)
    const iv = CryptoJS.lib.WordArray.random(16);

    // 3. Encrypt via CryptoJS AES-CBC with standard PKCS7 padding
    const encrypted = CryptoJS.AES.encrypt(value, keyWA, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    // 4. Format iv and ciphertext as Base64 strings
    const ivBase64 = CryptoJS.enc.Base64.stringify(iv);
    const ciphertextBase64 = encrypted.toString(); // Defaults to base64 ciphertext in CryptoJS

    return `${ivBase64}:${ciphertextBase64}`;
  } catch (error: any) {
    console.error('[FieldCipher] Field encryption failure:', error);
    throw new Error(`ENCRYPTION_FAILED: Failed to encrypt database column: ${error.message || error}`);
  }
}

/**
 * Decrypts a composite "ivBase64:ciphertextBase64" string back to a plaintext UTF-8 string.
 */
export function decryptField(encryptedValue: string): string {
  if (!encryptedValue) {
    return '';
  }

  try {
    // 1. Parse IV and ciphertext components
    const parts = encryptedValue.split(':');
    if (parts.length !== 2) {
      throw new Error('INVALID_FIELD_CIPHERTEXT_FORMAT: Expected "ivBase64:ciphertextBase64" layout');
    }

    const iv = CryptoJS.enc.Base64.parse(parts[0]);
    const ciphertext = parts[1];

    // 2. Fetch master key
    const masterKeyHex = keyManager.getMasterKeySync();
    const keyWA = CryptoJS.enc.Hex.parse(masterKeyHex);

    // 3. Decrypt ciphertext using AES-CBC
    const decrypted = CryptoJS.AES.decrypt(ciphertext, keyWA, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    // 4. Parse UTF-8 string output
    const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
    if (plaintext === '') {
      throw new Error('DECRYPTION_FAILED: Output was empty or invalid key was supplied');
    }

    return plaintext;
  } catch (error: any) {
    console.error('[FieldCipher] Field decryption failure:', error);
    throw new Error(`DECRYPTION_FAILED: Failed to decrypt database column: ${error.message || error}`);
  }
}
