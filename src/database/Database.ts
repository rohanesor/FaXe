import { databaseManager } from '../modules/database/DatabaseManager';
import { decryptField, encryptField } from '../modules/encryption/FieldCipher';
import { encrypt } from '../modules/encryption/EmbeddingCipher';
import { serializeEmbedding } from '../modules/recognition/EmbeddingSerializer';
import { syncQueueRepository } from '../modules/database/SyncQueueRepository';

/**
 * Checks if a user with the given name (case-insensitive) already exists in the database.
 */
export async function checkDuplicateName(name: string): Promise<boolean> {
  try {
    const db = databaseManager.getDB();
    const result = db.execute('SELECT name_encrypted FROM users WHERE sync_status != ?;', ['deleted']);
    const len = result.rows?.length ?? 0;
    const searchName = name.trim().toLowerCase();

    for (let i = 0; i < len; i++) {
      const row = result.rows?.item(i);
      if (!row || !row.name_encrypted) continue;
      try {
        const decrypted = decryptField(row.name_encrypted).trim().toLowerCase();
        if (decrypted === searchName) {
          return true;
        }
      } catch (e) {
        // Skip corrupt or un-decryptable fields
      }
    }
  } catch (error) {
    console.error('[Database] checkDuplicateName failed:', error);
  }
  return false;
}

/**
 * Checks if a user with the given employee ID already exists in the database.
 */
export async function checkDuplicateEmployeeId(id: string): Promise<boolean> {
  try {
    const db = databaseManager.getDB();
    // Employee ID is stored as the primary key 'id' in our table schema
    const result = db.execute('SELECT id FROM users WHERE LOWER(id) = LOWER(?) AND sync_status != ?;', [id.trim(), 'deleted']);
    return (result.rows?.length ?? 0) > 0;
  } catch (error) {
    console.error('[Database] checkDuplicateEmployeeId failed:', error);
    return false;
  }
}

/**
 * Updates the embedding of an existing user with the matching name (case-insensitive).
 */
export async function updateEmbedding(name: string, embedding: Float32Array): Promise<void> {
  const db = databaseManager.getDB();
  const searchName = name.trim().toLowerCase();
  
  // 1. Locate the existing user ID and role/partition details
  let targetUser: { id: string; role_encrypted: string; partition: string } | null = null;
  const result = db.execute('SELECT id, name_encrypted, role_encrypted, partition FROM users WHERE sync_status != ?;', ['deleted']);
  const len = result.rows?.length ?? 0;

  for (let i = 0; i < len; i++) {
    const row = result.rows?.item(i);
    if (!row || !row.name_encrypted) continue;
    try {
      const decryptedName = decryptField(row.name_encrypted).trim().toLowerCase();
      if (decryptedName === searchName) {
        targetUser = {
          id: row.id,
          role_encrypted: row.role_encrypted,
          partition: row.partition,
        };
        break;
      }
    } catch (e) {}
  }

  if (!targetUser) {
    throw new Error(`USER_NOT_FOUND: No user found with name '${name}'`);
  }

  // 2. Encrypt the new biometric embedding vector
  const serializedVector = serializeEmbedding(embedding);
  const encryptedVectorBlob = await encrypt(targetUser.id, serializedVector);

  // Convert Uint8Array to ArrayBuffer for react-native-quick-sqlite BLOB compatibility
  const binaryBuffer = encryptedVectorBlob.buffer.slice(
    encryptedVectorBlob.byteOffset,
    encryptedVectorBlob.byteOffset + encryptedVectorBlob.byteLength
  );

  const now = Date.now();

  // 3. Perform database transaction to update local user row
  await db.transaction(async (tx) => {
    tx.execute(
      `UPDATE users SET 
        embedding_blob = ?, 
        last_seen = ?, 
        sync_status = 'pending' 
      WHERE id = ?;`,
      [binaryBuffer, now, targetUser!.id]
    );
  });

  // 4. Enqueue synchronization action for cloud update
  const encryptedVectorBlobHex = Array.from(encryptedVectorBlob)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  await syncQueueRepository.enqueue('enroll_user', {
    userId: targetUser.id,
    name_encrypted: encryptField(name.trim()),
    role_encrypted: targetUser.role_encrypted,
    partition: targetUser.partition,
    embedding_blob_hex: encryptedVectorBlobHex,
    enrolled_at: now,
  });

  console.log(`[Database] Successfully updated biometric embedding for user ${name} (ID: ${targetUser.id})`);
}
