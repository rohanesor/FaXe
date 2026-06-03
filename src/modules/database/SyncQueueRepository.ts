/* eslint-disable no-bitwise */
import { databaseManager } from './DatabaseManager';
import { SyncQueueItem } from '../../types/database';

/**
 * Generates an RFC4122 Version 4 compliant UUID.
 * Utilizes crypto.randomUUID where supported, with a secure random fallback.
 */
export function generateUUID(): string {
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Repository handling the queue of offline database changes waiting to sync with the server.
 */
class SyncQueueRepository {
  private static instance: SyncQueueRepository;

  private constructor() {}

  public static getInstance(): SyncQueueRepository {
    if (!SyncQueueRepository.instance) {
      SyncQueueRepository.instance = new SyncQueueRepository();
    }
    return SyncQueueRepository.instance;
  }

  /**
   * Enqueues an offline action to be synchronized.
   */
  public async enqueue(action: 'enroll_user' | 'log_auth' | 'delete_user', payload: object): Promise<void> {
    const db = databaseManager.getDB();
    const id = generateUUID();
    const payloadStr = JSON.stringify(payload);
    const now = Date.now();

    try {
      db.execute(
        'INSERT INTO sync_queue (id, action, payload, created_at, attempts, last_attempt) VALUES (?, ?, ?, ?, 0, NULL);',
        [id, action, payloadStr, now]
      );
      console.log(`[SyncQueueRepository] Enqueued action '${action}' (ID: ${id})`);
    } catch (error) {
      console.error('[SyncQueueRepository] Enqueue failed:', error);
      throw error;
    }
  }

  /**
   * Fetches pending queue items ordered by creation time, where sync attempts < 5.
   */
  public async getPending(limit: number): Promise<SyncQueueItem[]> {
    const db = databaseManager.getDB();
    try {
      const result = db.execute(
        'SELECT id, action, payload, created_at, attempts, last_attempt FROM sync_queue WHERE attempts < 5 ORDER BY created_at ASC LIMIT ?;',
        [limit]
      );

      const items: SyncQueueItem[] = [];
      const len = result.rows?.length ?? 0;
      for (let i = 0; i < len; i++) {
        const row = result.rows?.item(i);
        items.push({
          id: row.id,
          action: row.action,
          payload: row.payload,
          createdAt: new Date(row.created_at).toISOString(),
          attempts: row.attempts,
          lastAttempt: row.last_attempt ? new Date(row.last_attempt).toISOString() : undefined,
        });
      }
      return items;
    } catch (error) {
      console.error('[SyncQueueRepository] Failed to fetch pending items:', error);
      return [];
    }
  }

  /**
   * Increments the retry counter and updates the timestamp for a failed sync item.
   */
  public async markFailed(id: string): Promise<void> {
    const db = databaseManager.getDB();
    const now = Date.now();
    try {
      db.execute(
        'UPDATE sync_queue SET attempts = attempts + 1, last_attempt = ? WHERE id = ?;',
        [now, id]
      );
      console.log(`[SyncQueueRepository] Marked item as failed (ID: ${id})`);
    } catch (error) {
      console.error('[SyncQueueRepository] Failed to mark item failed:', error);
      throw error;
    }
  }

  /**
   * Deletes a queue item after successful synchronization.
   */
  public async delete(id: string): Promise<void> {
    const db = databaseManager.getDB();
    try {
      db.execute('DELETE FROM sync_queue WHERE id = ?;', [id]);
      console.log(`[SyncQueueRepository] Deleted item (ID: ${id})`);
    } catch (error) {
      console.error('[SyncQueueRepository] Failed to delete queue item:', error);
      throw error;
    }
  }

  /**
   * Returns the count of unprocessed items.
   */
  public async getPendingCount(): Promise<number> {
    const db = databaseManager.getDB();
    try {
      const result = db.execute('SELECT COUNT(*) as count FROM sync_queue WHERE attempts < 5;');
      return result.rows?.item(0)?.count ?? 0;
    } catch (error) {
      console.error('[SyncQueueRepository] Failed to count pending items:', error);
      return 0;
    }
  }

  /**
   * Fetches sync queue items that have failed 5 or more times (dead letter queue).
   */
  public async getDeadLetterQueue(): Promise<SyncQueueItem[]> {
    const db = databaseManager.getDB();
    try {
      const result = db.execute(
        'SELECT id, action, payload, created_at, attempts, last_attempt FROM sync_queue WHERE attempts >= 5 ORDER BY created_at ASC;'
      );

      const items: SyncQueueItem[] = [];
      const len = result.rows?.length ?? 0;
      for (let i = 0; i < len; i++) {
        const row = result.rows?.item(i);
        items.push({
          id: row.id,
          action: row.action,
          payload: row.payload,
          createdAt: new Date(row.created_at).toISOString(),
          attempts: row.attempts,
          lastAttempt: row.last_attempt ? new Date(row.last_attempt).toISOString() : undefined,
        });
      }
      return items;
    } catch (error) {
      console.error('[SyncQueueRepository] Failed to fetch dead letter items:', error);
      return [];
    }
  }

  /**
   * Resets the attempts counter to 0 for all items in the queue (re-enabling retry processing).
   */
  public async resetAllAttempts(): Promise<void> {
    const db = databaseManager.getDB();
    try {
      db.execute('UPDATE sync_queue SET attempts = 0;');
      console.log('[SyncQueueRepository] Attempts reset to 0 for all queued items.');
    } catch (error) {
      console.error('[SyncQueueRepository] Failed to reset attempts:', error);
      throw error;
    }
  }
}

export const syncQueueRepository = SyncQueueRepository.getInstance();
export { SyncQueueRepository };
