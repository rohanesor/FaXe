import { databaseManager } from './DatabaseManager';
import { authLogRepository } from './AuthLogRepository';
import { PURGE_DAYS_UNSYNCED_LOGS, PURGE_DAYS_INACTIVE_USER } from '../../utils/constants';

/**
 * Summary detailing the results of the background database cleanup.
 */
export interface PurgeSummary {
  logsDeleted: number;
  usersFlagged: number;
  runAt: string; // ISO timestamp
}

/**
 * Orchestrator class managing local database cleanup and security flagging operations.
 */
class PurgeManager {
  private static instance: PurgeManager;

  private constructor() {}

  public static getInstance(): PurgeManager {
    if (!PurgeManager.instance) {
      PurgeManager.instance = new PurgeManager();
    }
    return PurgeManager.instance;
  }

  /**
   * Runs all database purge and status flagging policies.
   * 1. Deletes synced auth logs older than PURGE_DAYS_UNSYNCED_LOGS (30 days).
   * 2. Flags users not seen in the last PURGE_DAYS_INACTIVE_USER (90 days) as 'inactive_flagged'.
   */
  public async runPurge(): Promise<PurgeSummary> {
    const runAt = new Date().toISOString();
    console.log('[PurgeManager] Starting database cleanup execution...');

    try {
      const db = databaseManager.getDB();

      // Policy 1: Purge synced verification logs older than 30 days
      const logsDeleted = await authLogRepository.purgeOldSynced(PURGE_DAYS_UNSYNCED_LOGS);

      // Policy 2: Flag inactive profiles not seen in the last 90 days
      const inactiveCutoff = Date.now() - PURGE_DAYS_INACTIVE_USER * 86400000;
      
      const updateResult = db.execute(
        `UPDATE users 
         SET sync_status = 'inactive_flagged' 
         WHERE last_seen < ? AND sync_status != 'inactive_flagged';`,
        [inactiveCutoff]
      );
      
      const usersFlagged = updateResult.rowsAffected ?? 0;

      console.log(
        `[PurgeManager] Cleanup complete. Logs deleted: ${logsDeleted}, Inactive profiles flagged: ${usersFlagged}`
      );

      return {
        logsDeleted,
        usersFlagged,
        runAt,
      };
    } catch (error) {
      console.error('[PurgeManager] Database purge execution failed:', error);
      return {
        logsDeleted: 0,
        usersFlagged: 0,
        runAt,
      };
    }
  }
}

export const purgeManager = PurgeManager.getInstance();
export { PurgeManager };
