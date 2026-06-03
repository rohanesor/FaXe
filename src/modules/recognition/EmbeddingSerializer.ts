/**
 * Serializes a 128-float face embedding vector into a 512-byte Uint8Array binary blob
 * suitable for database storage (SQLite).
 * 
 * Math logic:
 * 128 floats * 4 bytes per float = 512 bytes total.
 */
export function serializeEmbedding(embedding: Float32Array): Uint8Array {
  if (embedding.length !== 128) {
    throw new Error(`INVALID_INPUT: Expected Float32Array of length 128, got ${embedding.length}`);
  }
  // Create a Uint8Array representation sharing the same ArrayBuffer
  return new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

/**
 * Deserializes a 512-byte Uint8Array binary blob back into a 128-float Float32Array.
 * Validates that the input blob is exactly 512 bytes.
 */
export function deserializeEmbedding(blob: Uint8Array): Float32Array {
  if (blob.byteLength !== 512) {
    throw new Error(`INVALID_INPUT: Expected Uint8Array of size 512 bytes, got ${blob.byteLength}`);
  }

  // Create an aligned buffer to prevent Float32 memory alignment exceptions in JavaScript Engines
  const alignedBuffer = new ArrayBuffer(512);
  new Uint8Array(alignedBuffer).set(blob);

  return new Float32Array(alignedBuffer);
}
