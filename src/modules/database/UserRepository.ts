import { databaseManager } from './DatabaseManager';
import { syncQueueRepository } from './SyncQueueRepository';
import { encryptField, decryptField } from '../encryption/FieldCipher';
import { encrypt, decrypt, safeDecrypt } from '../encryption/EmbeddingCipher';
import { serializeEmbedding } from '../recognition/EmbeddingSerializer';
import { StoredEmbedding } from '../../types/recognition';
import { EnrollmentInput, StoredUser } from '../../types/database';

/**
 * Utility to securely wipe decrypted embedding byte arrays from memory (RAM) 
 * by filling them with zeros. Prevents memory dump exploits.
 */
export function wipeStoredEmbeddings(embeddings: StoredEmbedding[]): void {
  if (!embeddings || embeddings.length === 0) return;
  for (const item of embeddings) {
    if (item.embeddingBlob) {
      item.embeddingBlob.fill(0);
    }
  }
  console.log(`[UserRepository] Securely zero-wiped ${embeddings.length} decrypted embeddings from RAM.`);
}

/**
 * Repository managing local database operations for User records in the SQLite database.
 * Ensures that sensitive fields and biometrics are never stored in plaintext.
 */
class UserRepository {
  private static instance: UserRepository;

  private constructor() {}

  public static getInstance(): UserRepository {
    if (!UserRepository.instance) {
      UserRepository.instance = new UserRepository();
    }
    return UserRepository.instance;
  }

  /**
   * Enrolls a new user locally.
   * 1. Encrypts name + role with FieldCipher (AES-CBC).
   * 2. Encrypts face embedding with EmbeddingCipher (AES-GCM).
   * 3. Inserts the user record into the users table.
   * 4. Enqueues an 'enroll_user' action to the sync queue.
   */
  public async enrollUser(user: EnrollmentInput): Promise<void> {
    const db = databaseManager.getDB();
    const enrolledTime = new Date(user.enrolledAt).getTime();

    try {
      // A. Encrypt sensitive fields
      const encryptedName = encryptField(user.name);
      const encryptedRole = encryptField(user.role);

      // B. Encrypt biometric embedding
      // Convert Float32Array to Uint8Array (512-byte or 768-byte)
      const serializedVector = serializeEmbedding(user.embedding);
      // Encrypt vector with AES-256-GCM (returns 540-byte or 796-byte blob)
      const encryptedVectorBlob = await encrypt(user.userId, serializedVector);

      // C. Perform local SQLite database write inside a transaction
      await db.transaction(async (tx) => {
        // Convert Uint8Array to ArrayBuffer for react-native-quick-sqlite BLOB compatibility
        const binaryBuffer = encryptedVectorBlob.buffer.slice(
          encryptedVectorBlob.byteOffset,
          encryptedVectorBlob.byteOffset + encryptedVectorBlob.byteLength
        );

        tx.execute(
          `INSERT INTO users (
            id, name_encrypted, role_encrypted, partition, embedding_blob, enrolled_at, last_seen, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending');`,
          [
            user.userId,
            encryptedName,
            encryptedRole,
            user.partition,
            binaryBuffer,
            enrolledTime,
            enrolledTime, // initial last_seen is same as enrolled_at
          ]
        );
      });

      // D. Enqueue sync event
      // Convert binary blob to hex string for JSON synchronization compatibility
      const encryptedVectorBlobHex = Array.from(encryptedVectorBlob)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      await syncQueueRepository.enqueue('enroll_user', {
        userId: user.userId,
        name_encrypted: encryptedName,
        role_encrypted: encryptedRole,
        partition: user.partition,
        embedding_blob_hex: encryptedVectorBlobHex,
        enrolled_at: enrolledTime,
      });

      console.log(`[UserRepository] User ${user.userId} enrolled successfully.`);
    } catch (error) {
      console.error('[UserRepository] Local user enrollment failed:', error);
      throw error;
    }
  }

  /**
   * Retrieves all users enrolled in a specific partition code.
   * Decrypts sensitive fields (name, role) in-memory before returning them.
   */
  public async getUsersByPartition(partition: string): Promise<StoredUser[]> {
    const db = databaseManager.getDB();
    try {
      const result = db.execute(
        'SELECT id, name_encrypted, role_encrypted, partition, enrolled_at, last_seen, sync_status FROM users WHERE partition = ?;',
        [partition]
      );

      const users: StoredUser[] = [];
      const len = result.rows?.length ?? 0;
      
      for (let i = 0; i < len; i++) {
        const row = result.rows?.item(i);
        
        // Decrypt text fields on-the-fly
        const name = decryptField(row.name_encrypted);
        const role = decryptField(row.role_encrypted);

        users.push({
          id: row.id,
          name,
          role,
          partition: row.partition,
          enrolledAt: new Date(row.enrolled_at).toISOString(),
          lastSeen: new Date(row.last_seen).toISOString(),
          syncStatus: row.sync_status,
        });
      }
      return users;
    } catch (error) {
      console.error('[UserRepository] Failed to fetch users by partition:', error);
      return [];
    }
  }

  /**
   * Retrieves and decrypts the face embeddings of all users in a partition.
   * Used for linear scanning during identity verification.
   * NOTE: Callers must call wipeStoredEmbeddings() on the returned array immediately after matching.
   *
   * Production-safe: each embedding is decrypted individually inside its own try/catch.
   * A single corrupt or legacy blob will NOT kill the entire function.
   */
  public async getEmbeddingsForPartition(partition: string): Promise<StoredEmbedding[]> {
    const db = databaseManager.getDB();
    const storedEmbeddings: StoredEmbedding[] = [];

    try {
      const result = db.execute(
        'SELECT id, embedding_blob, enrolled_at FROM users WHERE partition = ? AND sync_status != ?;',
        [partition, 'deleted']
      );

      const totalCandidates = result.rows?.length ?? 0;
      console.log(`[UserRepository] Fetched ${totalCandidates} raw rows from SQLite for partition '${partition}'`);

      if (totalCandidates === 0) return [];

      let decryptedCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < totalCandidates; i++) {
        const row = result.rows?.item(i);
        try {
          const encryptedBlob = row.embedding_blob;

          // Skip null or empty blobs silently
          if (!encryptedBlob || encryptedBlob.length === 0) {
            console.warn(`[UserRepository] Skipping user ${row.id}: embedding_blob is null or empty.`);
            skippedCount++;
            continue;
          }

          // Convert to Uint8Array if needed (SQLite may return ArrayBuffer)
          let blobArray: Uint8Array;
          if (encryptedBlob instanceof Uint8Array) {
            blobArray = encryptedBlob;
          } else if (encryptedBlob instanceof ArrayBuffer) {
            blobArray = new Uint8Array(encryptedBlob);
          } else if (typeof encryptedBlob === 'string') {
            // Base64 string from SQLite — decode it
            const binaryStr = (globalThis as any).atob(encryptedBlob);
            blobArray = new Uint8Array(binaryStr.length);
            for (let j = 0; j < binaryStr.length; j++) {
              blobArray[j] = binaryStr.charCodeAt(j);
            }
          } else {
            console.warn(`[UserRepository] Skipping user ${row.id}: unexpected blob type ${typeof encryptedBlob}`);
            skippedCount++;
            continue;
          }

          console.log(`[UserRepository] Decrypting embedding for user ${row.id} (blob size: ${blobArray.length} bytes)`);

          // Attempt safe decryption (returns null on failure instead of throwing)
          const decryptedVector = await safeDecrypt(row.id, blobArray);

          if (decryptedVector) {
            storedEmbeddings.push({
              userId: row.id,
              embeddingBlob: decryptedVector,
              enrolledAt: new Date(row.enrolled_at).toISOString(),
            });
            decryptedCount++;
          } else {
            // Fallback: if blob is exactly 512 or 768 bytes, treat it as raw unencrypted Float32Array
            if (blobArray.length === 512 || blobArray.length === 768) {
              console.log(`[UserRepository] Using legacy ${blobArray.length}-byte raw fallback for user ${row.id}`);
              storedEmbeddings.push({
                userId: row.id,
                embeddingBlob: blobArray,
                enrolledAt: new Date(row.enrolled_at).toISOString(),
              });
              decryptedCount++;
            } else {
              console.error(`[UserRepository] Decryption failed for user ${row.id}, blob size ${blobArray.length}. Skipping.`);
              skippedCount++;
            }
          }
        } catch (rowError: any) {
          console.error(`[UserRepository] Error processing embedding for user ${row.id}: ${rowError.message || rowError}`);
          skippedCount++;
        }
      }

      console.log(`[UserRepository] Successfully decrypted ${decryptedCount} of ${totalCandidates} embeddings (${skippedCount} skipped)`);
      return storedEmbeddings;
    } catch (error) {
      console.error('[UserRepository] Failed to load embeddings for partition:', error);
      // Ensure we clear any partially decrypted data in case of error
      wipeStoredEmbeddings(storedEmbeddings);
      return [];
    }
  }

  /**
   * Updates the last seen timestamp of a user locally and adds a sync queue update action.
   */
  public async updateLastSeen(userId: string): Promise<void> {
    const db = databaseManager.getDB();
    const now = Date.now();

    try {
      db.execute('UPDATE users SET last_seen = ? WHERE id = ?;', [now, userId]);
      
      // Enqueue sync update
      await syncQueueRepository.enqueue('enroll_user', {
        userId,
        last_seen: now,
        action: 'update_last_seen',
      });
      console.log(`[UserRepository] Updated last seen for user ${userId}`);
    } catch (error) {
      console.error('[UserRepository] Failed to update user last seen timestamp:', error);
      throw error;
    }
  }

  /**
   * Upserts a user record directly (used when pulling updates from cloud).
   * Does not enqueue synchronization items to avoid loops.
   */
  public async upsertUser(user: {
    id: string;
    name_encrypted: string;
    role_encrypted: string;
    partition: string;
    embedding_blob?: Uint8Array;
    enrolled_at: number;
    last_seen: number;
    sync_status: 'synced' | 'pending';
  }): Promise<void> {
    const db = databaseManager.getDB();
    try {
      await db.transaction(async (tx) => {
        const check = tx.execute('SELECT id FROM users WHERE id = ?;', [user.id]);
        const exists = (check.rows?.length ?? 0) > 0;

        if (exists) {
          if (user.embedding_blob) {
            // Convert Uint8Array to ArrayBuffer for react-native-quick-sqlite BLOB compatibility
            const binaryBuffer = user.embedding_blob.buffer.slice(
              user.embedding_blob.byteOffset,
              user.embedding_blob.byteOffset + user.embedding_blob.byteLength
            );

            tx.execute(
              `UPDATE users SET 
                name_encrypted = ?, 
                role_encrypted = ?, 
                partition = ?, 
                embedding_blob = ?, 
                enrolled_at = ?, 
                last_seen = ?, 
                sync_status = ? 
              WHERE id = ?;`,
              [
                user.name_encrypted,
                user.role_encrypted,
                user.partition,
                binaryBuffer,
                user.enrolled_at,
                user.last_seen,
                user.sync_status,
                user.id,
              ]
            );
          } else {
            tx.execute(
              `UPDATE users SET 
                name_encrypted = ?, 
                role_encrypted = ?, 
                partition = ?, 
                enrolled_at = ?, 
                last_seen = ?, 
                sync_status = ? 
              WHERE id = ?;`,
              [
                user.name_encrypted,
                user.role_encrypted,
                user.partition,
                user.enrolled_at,
                user.last_seen,
                user.sync_status,
                user.id,
              ]
            );
          }
        } else {
          // Convert Uint8Array to ArrayBuffer for react-native-quick-sqlite BLOB compatibility
          const binaryBuffer = user.embedding_blob
            ? user.embedding_blob.buffer.slice(
                user.embedding_blob.byteOffset,
                user.embedding_blob.byteOffset + user.embedding_blob.byteLength
              )
            : null;

          tx.execute(
            `INSERT INTO users (
              id, name_encrypted, role_encrypted, partition, embedding_blob, enrolled_at, last_seen, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              user.id,
              user.name_encrypted,
              user.role_encrypted,
              user.partition,
              binaryBuffer,
              user.enrolled_at,
              user.last_seen,
              user.sync_status,
            ]
          );
        }
      });
      console.log(`[UserRepository] Upserted user ID: ${user.id} (${user.sync_status})`);
    } catch (error) {
      console.error('[UserRepository] Failed to upsert user:', error);
      throw error;
    }
  }

  /**
   * Deletes a user locally from the SQLite database.
   * Enqueues a 'delete_user' action for server synchronization if enqueueSync is true.
   */
  public async deleteUser(userId: string, enqueueSync: boolean = true): Promise<void> {
    const db = databaseManager.getDB();

    try {
      await db.transaction(async (tx) => {
        tx.execute('DELETE FROM users WHERE id = ?;', [userId]);
      });

      if (enqueueSync) {
        // Enqueue sync event
        await syncQueueRepository.enqueue('delete_user', {
          userId,
        });
      }

      console.log(`[UserRepository] Hard deleted user ${userId} locally.`);
    } catch (error) {
      console.error('[UserRepository] Failed to delete user locally:', error);
      throw error;
    }
  }

  /**
   * Retrieves the total count of users in the database.
   */
  public async getUsersCount(): Promise<number> {
    const db = databaseManager.getDB();
    try {
      const result = db.execute('SELECT COUNT(*) as count FROM users;');
      return result.rows?.item(0)?.count ?? 0;
    } catch (error) {
      console.error('[UserRepository] Failed to count users:', error);
      return 0;
    }
  }
}

export const userRepository = UserRepository.getInstance();
export { UserRepository };
