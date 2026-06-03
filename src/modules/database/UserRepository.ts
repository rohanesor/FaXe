import { databaseManager } from './DatabaseManager';
import { syncQueueRepository } from './SyncQueueRepository';
import { encryptField, decryptField } from '../encryption/FieldCipher';
import { encrypt, decrypt } from '../encryption/EmbeddingCipher';
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
      // Convert Float32Array to 512-byte Uint8Array
      const serializedVector = serializeEmbedding(user.embedding);
      // Encrypt vector with AES-256-GCM (returns 540-byte blob)
      const encryptedVectorBlob = await encrypt(user.userId, serializedVector);

      // C. Perform local SQLite database write inside a transaction
      await db.transaction(async (tx) => {
        tx.execute(
          `INSERT INTO users (
            id, name_encrypted, role_encrypted, partition, embedding_blob, enrolled_at, last_seen, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending');`,
          [
            user.userId,
            encryptedName,
            encryptedRole,
            user.partition,
            encryptedVectorBlob,
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
   */
  public async getEmbeddingsForPartition(partition: string): Promise<StoredEmbedding[]> {
    const db = databaseManager.getDB();
    const storedEmbeddings: StoredEmbedding[] = [];

    try {
      const result = db.execute(
        'SELECT id, embedding_blob, enrolled_at FROM users WHERE partition = ?;',
        [partition]
      );

      const len = result.rows?.length ?? 0;
      
      for (let i = 0; i < len; i++) {
        const row = result.rows?.item(i);
        const encryptedBlob = row.embedding_blob; // Uint8Array returned from DB blob

        // Decrypt AES-256-GCM embedding blob (returns 512-byte Uint8Array)
        const decryptedVector = await decrypt(row.id, encryptedBlob);

        storedEmbeddings.push({
          userId: row.id,
          embeddingBlob: decryptedVector,
          enrolledAt: new Date(row.enrolled_at).toISOString(),
        });
      }
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
   * Deletes a user locally from the SQLite database.
   * Enqueues a 'delete_user' action for server synchronization.
   */
  public async deleteUser(userId: string): Promise<void> {
    const db = databaseManager.getDB();

    try {
      await db.transaction(async (tx) => {
        tx.execute('DELETE FROM users WHERE id = ?;', [userId]);
      });

      // Enqueue sync event
      await syncQueueRepository.enqueue('delete_user', {
        userId,
      });

      console.log(`[UserRepository] Hard deleted user ${userId} locally.`);
    } catch (error) {
      console.error('[UserRepository] Failed to delete user locally:', error);
      throw error;
    }
  }
}

export const userRepository = UserRepository.getInstance();
export { UserRepository };
