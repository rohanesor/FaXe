import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { databaseManager } from './DatabaseManager';
import { syncQueueRepository, generateUUID } from './SyncQueueRepository';
import { AuthLogInput } from '../../types/database';
import { AuthLog } from '../../types';
import { VerificationOutcome } from '../../types/verification';

/**
 * Request location permission based on the platform.
 */
const hasLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'ios') {
    const status = await Geolocation.requestAuthorization('whenInUse');
    return status === 'granted';
  }

  if (Platform.OS === 'android') {
    const hasPermission = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    if (hasPermission) {
      return true;
    }

    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return status === PermissionsAndroid.RESULTS.GRANTED;
  }

  return false;
};

/**
 * Retrieves GPS coordinates within a strict 2-second timeout limit.
 */
const getGPSCoordinates = async (): Promise<{ latitude: number | null; longitude: number | null }> => {
  try {
    const hasPermission = await hasLocationPermission();
    if (!hasPermission) {
      console.log('[Location] Permission for geolocation denied.');
      return { latitude: null, longitude: null };
    }

    return new Promise((resolve) => {
      let completed = false;

      const timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          console.log('[Location] Geolocation request timed out (2s).');
          resolve({ latitude: null, longitude: null });
        }
      }, 2000);

      Geolocation.getCurrentPosition(
        (position) => {
          if (!completed) {
            completed = true;
            clearTimeout(timeoutId);
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          }
        },
        (error) => {
          if (!completed) {
            completed = true;
            clearTimeout(timeoutId);
            console.log('[Location] Geolocation error:', error.message);
            resolve({ latitude: null, longitude: null });
          }
        },
        {
          enableHighAccuracy: false,
          timeout: 2000,
          maximumAge: 10000,
        }
      );
    });
  } catch (err) {
    console.error('[Location] Error fetching coordinates:', err);
    return { latitude: null, longitude: null };
  }
};

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
   * 1. Fetches GPS coordinates (within 2s timeout).
   * 2. Maps the VerificationOutcome to 'success', 'failure', or 'spoof'.
   * 3. Inserts the record into local SQLite.
   * 4. Enqueues a 'log_auth' action to the sync queue.
   */
  public async logAuthAttempt(log: AuthLogInput): Promise<void> {
    const db = databaseManager.getDB();
    const logId = generateUUID();
    const now = Date.now();

    // Fetch coordinates dynamically if not explicitly provided
    let latitude = log.latitude;
    let longitude = log.longitude;
    if (latitude === undefined || longitude === undefined) {
      const coords = await getGPSCoordinates();
      latitude = coords.latitude ?? undefined;
      longitude = coords.longitude ?? undefined;
    }

    // Map outcome to SQLite result string
    let dbResult: 'success' | 'failure' | 'spoof' | 'app_error' = log.result;
    if (log.outcome) {
      if (log.outcome === VerificationOutcome.VERIFIED) {
        dbResult = 'success';
      } else if (log.outcome === VerificationOutcome.SPOOF_DETECTED) {
        dbResult = 'spoof';
      } else {
        dbResult = 'failure';
      }
    }

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
            dbResult,
            log.confidence,
            log.livenessScore,
            latitude ?? null,
            longitude ?? null,
          ]
        );
      });

      // Enqueue to synchronization queue
      await syncQueueRepository.enqueue('log_auth', {
        logId,
        userId: log.userId,
        timestamp: now,
        result: dbResult,
        confidence: log.confidence,
        livenessScore: log.livenessScore,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
      });

      console.log(`[AuthLogRepository] Verification logged locally (ID: ${logId}, Result: ${dbResult})`);
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

  /**
   * Retrieves the most recent verification attempt.
   */
  public async getLastAttempt(): Promise<AuthLog | null> {
    const db = databaseManager.getDB();
    try {
      const result = db.execute(
        'SELECT id, user_id, timestamp, result, confidence, liveness_score, latitude, longitude, synced FROM auth_logs ORDER BY timestamp DESC LIMIT 1;'
      );
      const len = result.rows?.length ?? 0;
      if (len === 0) return null;
      
      const row = result.rows?.item(0);
      return {
        id: row.id,
        userId: row.user_id,
        timestamp: new Date(row.timestamp).toISOString(),
        result: row.result as 'success' | 'failure' | 'spoof',
        confidence: row.confidence,
        livenessScore: row.liveness_score,
        location: row.latitude !== null && row.longitude !== null 
          ? { latitude: row.latitude, longitude: row.longitude } 
          : undefined,
        synced: row.synced === 1,
      };
    } catch (error) {
      console.error('[AuthLogRepository] Failed to fetch last attempt:', error);
      return null;
    }
  }

  /**
   * Calculates today's verification success and failure counts.
   */
  public async getTodayStats(): Promise<{ success: number; failure: number }> {
    const db = databaseManager.getDB();
    // Start of today in local time (00:00:00)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    try {
      const result = db.execute(
        'SELECT result, COUNT(*) as count FROM auth_logs WHERE timestamp >= ? GROUP BY result;',
        [startOfTodayMs]
      );

      let success = 0;
      let failure = 0;
      const len = result.rows?.length ?? 0;

      for (let i = 0; i < len; i++) {
        const row = result.rows?.item(i);
        if (row.result === 'success') {
          success = row.count;
        } else if (row.result === 'failure' || row.result === 'spoof') {
          failure += row.count;
        }
      }

      return { success, failure };
    } catch (error) {
      console.error('[AuthLogRepository] Failed to fetch today stats:', error);
      return { success: 0, failure: 0 };
    }
  }

  /**
   * Retrieves the total count of logs in the database.
   */
  public async getLogsCount(): Promise<number> {
    const db = databaseManager.getDB();
    try {
      const result = db.execute('SELECT COUNT(*) as count FROM auth_logs;');
      return result.rows?.item(0)?.count ?? 0;
    } catch (error) {
      console.error('[AuthLogRepository] Failed to count logs:', error);
      return 0;
    }
  }
}

export const authLogRepository = AuthLogRepository.getInstance();
export { AuthLogRepository };
