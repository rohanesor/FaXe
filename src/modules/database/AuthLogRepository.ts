import { databaseManager } from './DatabaseManager';
import { syncQueueRepository, generateUUID } from './SyncQueueRepository';
import { AuthLogInput } from '../../types/database';
import { AuthLog } from '../../types';

/**
 * Repository managing verification log records.
 * Tracks offline biometric authorization scans and sync status.
 */
class AuthLogRepository {
  private static instance: AuthLogRepository;

  private constructor() {}

  public static getInstance(): AuthLogRepository {
    if (!AuthLogRepository.instance) {
      AuthLogRepository.instance = new AuthLogRepository();
    }
    return AuthLogRepository.instance;
  }

  /**
   * Logs a biometric verification attempt.
   * 1. Inserts the record into local SQLite.
   * 2. Enqueues a 'log_auth' action to the sync queue.
   */
  public async logAuthAttempt(log: AuthLogInput): Promise<void> {
    const db = databaseManager.getDB();
    const logId = generateUUID();
    const now = Date.now();

    try {
      await db.transaction(async (tx) => {
        tx.execute(
          `INSERT INTO auth_logs (
            id, user_id, timestamp, result, confidence, liveness_score, latitude, longitude, synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0);`,
          [
            logId,
            log.userId,
            now,
            log.result,
            log.confidence,
            log.livenessScore,
            log.latitude ?? null,
            log.longitude ?? null,
          ]
        );
      });

      // Enqueue to synchronization queue
      await syncQueueRepository.enqueue('log_auth', {
        logId,
        userId: log.userId,
        timestamp: now,
        result: log.result,
        confidence: log.confidence,
        livenessScore: log.livenessScore,
        latitude: log.latitude ?? null,
        longitude: log.longitude ?? null,
      });

      console.log(`[AuthLogRepository] Verification logged locally (ID: ${logId})`);
    } catch (error) {
      console.error('[AuthLogRepository] Failed to insert log record:', error);
      throw error;
    }
  }

  /**
   * Retrieves all unsynced verification logs.
   */
  public async getUnsynced(): Promise<AuthLog[]> {
    const db = databaseManager.getDB();
    try {
      const result = db.execute(
        'SELECT id, user_id, timestamp, result, confidence, liveness_score, latitude, longitude, synced FROM auth_logs WHERE synced = 0 ORDER BY timestamp ASC;'
      );

      const logs: AuthLog[] = [];
      const len = result.rows?.length ?? 0;
      
      for (let i = 0; i < len; i++) {
        const row = result.rows?.item(i);
        logs.push({
          id: row.id,
          userId: row.user_id,
          timestamp: new Date(row.timestamp).toISOString(),
          result: row.result as 'success' | 'failure',
          confidence: row.confidence,
          livenessScore: row.liveness_score,
          location: row.latitude !== null && row.longitude !== null 
            ? { latitude: row.latitude, longitude: row.longitude } 
            : undefined,
          synced: row.synced === 1,
        });
      }
      return logs;
    } catch (error) {
      console.error('[AuthLogRepository] Failed to fetch unsynced logs:', error);
      return [];
    }
  }

  /**
   * Updates sync state to 1 (synced) for a list of log IDs.
   */
  public async markSynced(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const db = databaseManager.getDB();
    
    try {
      // Build batch parameters placeholder
      const placeholders = ids.map(() => '?').join(',');
      db.execute(
        `UPDATE auth_logs SET synced = 1 WHERE id IN (${placeholders});`,
        ids
      );
      console.log(`[AuthLogRepository] Marked ${ids.length} logs as synced.`);
    } catch (error) {
      console.error('[AuthLogRepository] Failed to mark logs as synced:', error);
      throw error;
    }
  }

  /**
   * Deletes synced logs that are older than the specified days threshold.
   * Returns the count of deleted rows.
   */
  public async purgeOldSynced(olderThanDays: number): Promise<number> {
    const db = databaseManager.getDB();
    const cutoffTime = Date.now() - olderThanDays * 86400000;

    try {
      const result = db.execute(
        'DELETE FROM auth_logs WHERE synced = 1 AND timestamp < ?;',
        [cutoffTime]
      );
      const rowsDeleted = result.rowsAffected ?? 0;
      console.log(`[AuthLogRepository] Purged ${rowsDeleted} old synced logs.`);
      return rowsDeleted;
    } catch (error) {
      console.error('[AuthLogRepository] Failed to purge old synced logs:', error);
      return 0;
    }
  }
}

export const authLogRepository = AuthLogRepository.getInstance();
export { AuthLogRepository };
