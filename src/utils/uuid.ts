/**
 * Utility to generate unique identifiers locally when offline.
 * Format: DEV-{deviceId}-{timestamp}-{random4}
 * This prevents collisions when offline data is later synchronized with the server.
 */
export function generateUUID(): string {
  const deviceId = 'DL-FACE-RN-99';
  const timestamp = Date.now();
  
  // Generate 4 random alphanumeric characters in uppercase
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let random4 = '';
  for (let i = 0; i < 4; i++) {
    const idx = Math.floor(Math.random() * alphabet.length);
    random4 += alphabet.charAt(idx);
  }

  return `DEV-${deviceId}-${timestamp}-${random4}`;
}
