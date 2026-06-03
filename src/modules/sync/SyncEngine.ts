import { connectivityMonitor } from './ConnectivityMonitor';
import { awsClient, AWSError } from './AWSClient';
import { conflictResolver, RemoteEmbedding } from './ConflictResolver';
import { deviceProvisioner } from './DeviceProvisioner';
import { storage } from '../../store';
import {
  userRepository,
  authLogRepository,
  syncQueueRepository,
  purgeManager,
  wipeStoredEmbeddings,
} from '../database';
import { Logger } from '../../utils/logger';

export interface SyncReport {
  pushedLogs: number;
  pushedEnrollments: number;
  pulledUsers: number;
  deletedLocally: number;
  conflicts: number;
  durationMs: number;
  error: string | null;
}

/**
 * Helper to convert hex string back to a Uint8Array.
 */
const hexToUint8Array = (hex: string): Uint8Array => {
  const length = hex.length / 2;
  const arr = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return arr;
};

/**
 * Coordinates synchronization schedules, batch API transfers, and cloud data aggregation.
 */
class SyncEngine {
  private static instance: SyncEngine;
  private syncing: boolean = false;
  private periodicSyncRef: any = null;

  private constructor() {
    // Automatically trigger synchronization when network connectivity is restored
    connectivityMonitor.onReconnect(() => {
      Logger.info('SyncEngine', 'Network connection restored. Auto-triggering database synchronization...');
      this.runSync().catch((err) => {
        Logger.error('SyncEngine', 'Auto sync failed on network reconnection', err);
      });
    });
  }

  public static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine();
    }
    return SyncEngine.instance;
  }

  /**
   * Status checker to prevent concurrent synchronization attempts.
   */
  public isSyncing(): boolean {
    return this.syncing;
  }

  /**
   * Retrieves the timestamp of the last successful sync operation.
   */
  public getLastSyncTime(): number | null {
    const lastSync = storage.getNumber('last_sync');
    return lastSync || null;
  }

  /**
   * Executes the full 6-phase synchronization pipeline.
   */
  public async runSync(): Promise<SyncReport> {
    if (this.syncing) {
      Logger.warn('SyncEngine', 'Sync is already running. Aborting duplicate request.');
      return {
        pushedLogs: 0,
        pushedEnrollments: 0,
        pulledUsers: 0,
        deletedLocally: 0,
        conflicts: 0,
        durationMs: 0,
        error: 'Sync engine is already busy.',
      };
    }

    if (!connectivityMonitor.isOnline()) {
      Logger.warn('SyncEngine', 'Device is offline. Aborting sync execution.');
      return {
        pushedLogs: 0,
        pushedEnrollments: 0,
        pulledUsers: 0,
        deletedLocally: 0,
        conflicts: 0,
        durationMs: 0,
        error: 'Device is currently offline.',
      };
    }

    this.syncing = true;
    const startTime = Date.now();
    
    const report: SyncReport = {
      pushedLogs: 0,
      pushedEnrollments: 0,
      pulledUsers: 0,
      deletedLocally: 0,
      conflicts: 0,
      durationMs: 0,
      error: null,
    };

    try {
      // ----------------------------------------------------
      // PHASE 1: AUTHENTICATE DEVICE
      // ----------------------------------------------------
      Logger.info('SyncEngine', '[Phase 1] Authenticating device credentials...');
      try {
        await awsClient.authenticateDevice();
      } catch (authError: any) {
        Logger.error('SyncEngine', 'Authentication failed, sync aborted.', authError);
        report.error = `Authentication failed: ${authError.message || authError}`;
        this.syncing = false;
        return report;
      }

      // ----------------------------------------------------
      // PHASE 2: PUSH AUTH LOGS
      // ----------------------------------------------------
      Logger.info('SyncEngine', '[Phase 2] Pushing unsynced authentication logs...');
      try {
        const unsyncedLogs = await authLogRepository.getUnsynced();
        Logger.info('SyncEngine', `Found ${unsyncedLogs.length} unsynced verification attempts.`);
        
        // Batch uploads in groups of 50
        for (let i = 0; i < unsyncedLogs.length; i += 50) {
          const batch = unsyncedLogs.slice(i, i + 50);
          try {
            await awsClient.pushAuthLogs(batch);
            await authLogRepository.markSynced(batch.map((log) => log.id));
            report.pushedLogs += batch.length;
          } catch (batchError) {
            Logger.error('SyncEngine', 'Failed to push auth logs batch', batchError);
            // Continue with subsequent batches to ensure fault tolerance
          }
        }
      } catch (logPhaseError: any) {
        Logger.error('SyncEngine', 'Critical error in auth logs push phase', logPhaseError);
      }

      // ----------------------------------------------------
      // PHASE 3: PUSH ENROLLMENT QUEUE
      // ----------------------------------------------------
      Logger.info('SyncEngine', '[Phase 3] Pushing database modifications queue...');
      try {
        const pendingQueue = await syncQueueRepository.getPending(100);
        // Sync enrollments or deletes (avoid sending log_auth here as logs are processed in Phase 2)
        const relevantItems = pendingQueue.filter(
          (item) => item.action === 'enroll_user' || item.action === 'delete_user'
        );
        
        Logger.info('SyncEngine', `Found ${relevantItems.length} queued user modifications.`);

        for (const item of relevantItems) {
          try {
            await awsClient.pushQueueItem(item);
            await syncQueueRepository.delete(item.id);
            report.pushedEnrollments++;
          } catch (itemError: any) {
            Logger.error('SyncEngine', `Failed to push queue item ${item.id}`, itemError);
            await syncQueueRepository.markFailed(item.id);

            // Abort the phase if a non-retryable authorization issue is returned
            if (itemError instanceof AWSError && !itemError.retryable) {
              throw itemError;
            }
          }
        }
      } catch (queuePhaseError: any) {
        Logger.error('SyncEngine', 'Critical error in modification queue push phase', queuePhaseError);
      }

      // ----------------------------------------------------
      // PHASE 4: PULL UPDATED ENROLLMENTS
      // ----------------------------------------------------
      Logger.info('SyncEngine', '[Phase 4] Pulling remote templates from cloud...');
      try {
        const provData = deviceProvisioner.getProvisioningData();
        const lastSync = this.getLastSyncTime() || 0;
        
        const remoteUsers = await awsClient.pullUpdatedUsers(provData.partition, lastSync);
        const localUsers = await userRepository.getUsersByPartition(provData.partition);

        for (const remoteUser of remoteUsers) {
          try {
            if (remoteUser.deleted) {
              // Delete locally without enqueuing sync triggers
              await userRepository.deleteUser(remoteUser.id, false);
              report.deletedLocally++;
            } else {
              const localUser = localUsers.find((u) => u.id === remoteUser.id);
              
              if (localUser) {
                // Conflict: user modified both locally and remotely
                report.conflicts++;
                const resolvedUser = conflictResolver.resolveUserConflict(localUser, remoteUser);
                
                let resolvedEmbedding: Uint8Array | undefined;
                if (remoteUser.embedding_blob_hex) {
                  const localEmbeddings = await userRepository.getEmbeddingsForPartition(provData.partition);
                  const localEmbedding = localEmbeddings.find((e) => e.userId === remoteUser.id);
                  
                  if (localEmbedding) {
                    const remoteEmbedding: RemoteEmbedding = {
                      userId: remoteUser.id,
                      embeddingBlobHex: remoteUser.embedding_blob_hex,
                      enrolledAt: new Date(remoteUser.enrolled_at).toISOString(),
                    };
                    const resolvedEmb = conflictResolver.resolveEmbeddingConflict(localEmbedding, remoteEmbedding);
                    resolvedEmbedding = resolvedEmb.embeddingBlob;
                  } else {
                    resolvedEmbedding = hexToUint8Array(remoteUser.embedding_blob_hex);
                  }
                  
                  // Clear decrypted embeddings cache from RAM
                  wipeStoredEmbeddings(localEmbeddings);
                }

                await userRepository.upsertUser({
                  id: resolvedUser.id,
                  name_encrypted: resolvedUser.name_encrypted,
                  role_encrypted: resolvedUser.role_encrypted,
                  partition: resolvedUser.partition,
                  embedding_blob: resolvedEmbedding,
                  enrolled_at: resolvedUser.enrolled_at,
                  last_seen: resolvedUser.last_seen,
                  sync_status: resolvedUser.sync_status,
                });
              } else {
                // Clean: remote enrollment does not exist locally
                const remoteEmbeddingBlob = remoteUser.embedding_blob_hex
                  ? hexToUint8Array(remoteUser.embedding_blob_hex)
                  : undefined;

                await userRepository.upsertUser({
                  id: remoteUser.id,
                  name_encrypted: remoteUser.name_encrypted,
                  role_encrypted: remoteUser.role_encrypted,
                  partition: remoteUser.partition,
                  embedding_blob: remoteEmbeddingBlob,
                  enrolled_at: remoteUser.enrolled_at,
                  last_seen: remoteUser.last_seen,
                  sync_status: 'synced',
                });
              }
              report.pulledUsers++;
            }
          } catch (userSyncError) {
            Logger.error('SyncEngine', `Failed to sync user ${remoteUser.id}`, userSyncError);
          }
        }
      } catch (pullPhaseError: any) {
        Logger.error('SyncEngine', 'Critical error in pull updates phase', pullPhaseError);
      }

      // ----------------------------------------------------
      // PHASE 5: PURGE
      // ----------------------------------------------------
      Logger.info('SyncEngine', '[Phase 5] Running database maintenance purge...');
      try {
        const deletedLogsCount = await purgeManager.runPurge();
        Logger.info('SyncEngine', `Purged ${deletedLogsCount} old records from cache.`);
      } catch (purgePhaseError: any) {
        Logger.error('SyncEngine', 'Critical error in purge phase', purgePhaseError);
      }

      // ----------------------------------------------------
      // PHASE 6: UPDATE SYNC TIMESTAMP
      // ----------------------------------------------------
      Logger.info('SyncEngine', '[Phase 6] Finalizing synchronization report...');
      storage.set('last_sync', Date.now());
      
      report.durationMs = Date.now() - startTime;
      storage.set('last_sync_report', JSON.stringify(report));

      Logger.info(
        'SyncEngine',
        `Synchronization complete in ${report.durationMs}ms. Pushed Logs: ${report.pushedLogs}, pulled: ${report.pulledUsers}, conflicts: ${report.conflicts}`
      );
    } catch (unexpectedError: any) {
      report.error = unexpectedError.message || 'An unexpected synchronization error occurred.';
      Logger.error('SyncEngine', 'Fatal synchronization pipeline exception', unexpectedError);
    } finally {
      this.syncing = false;
    }

    return report;
  }

  /**
   * Schedules a background synchronization runner at intervals when online.
   */
  public schedulePeriodicSync(intervalMs: number): void {
    if (this.periodicSyncRef) {
      clearInterval(this.periodicSyncRef);
      this.periodicSyncRef = null;
    }

    this.periodicSyncRef = setInterval(() => {
      if (connectivityMonitor.isOnline()) {
        Logger.info('SyncEngine', 'Running background scheduled periodic synchronization...');
        this.runSync().catch((err) => {
          Logger.error('SyncEngine', 'Periodic sync execution failed', err);
        });
      }
    }, intervalMs);

    Logger.info('SyncEngine', `Periodic sync scheduled every ${intervalMs / 1000}s`);
  }

  /**
   * Clears any active periodic synchronization schedules.
   */
  public clearPeriodicSync(): void {
    if (this.periodicSyncRef) {
      clearInterval(this.periodicSyncRef);
      this.periodicSyncRef = null;
      Logger.info('SyncEngine', 'Periodic synchronization cancelled.');
    }
  }
}

export const syncEngine = SyncEngine.getInstance();
export { SyncEngine };
