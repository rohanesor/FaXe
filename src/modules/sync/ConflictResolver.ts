import { StoredUser } from '../../types/database';
import { StoredEmbedding } from '../../types/recognition';
import { RemoteUser } from './AWSClient';
import { decryptField } from '../encryption/FieldCipher';
import { Logger } from '../../utils/logger';

/**
 * ResolvedUser schema for database storage after conflict mitigation.
 */
export interface ResolvedUser {
  id: string;
  name_encrypted: string;
  role_encrypted: string;
  partition: string;
  enrolled_at: number;
  last_seen: number;
  sync_status: 'synced' | 'pending';
}

/**
 * RemoteEmbedding format returned from server sync queries.
 */
export interface RemoteEmbedding {
  userId: string;
  embeddingBlobHex: string;
  enrolledAt: string;
}

/**
 * Handles conflict resolution strategies when offline modifications collide with remote cloud updates.
 */
class ConflictResolver {
  private static instance: ConflictResolver;

  private constructor() {}

  public static getInstance(): ConflictResolver {
    if (!ConflictResolver.instance) {
      ConflictResolver.instance = new ConflictResolver();
    }
    return ConflictResolver.instance;
  }

  /**
   * Resolves conflicts for user profile metadata.
   * Strategy:
   * 1. Cloud wins for metadata (name, role changes).
   * 2. Local wins for last_seen (the most recent timestamp wins).
   */
  public resolveUserConflict(local: StoredUser, remote: RemoteUser): ResolvedUser {
    Logger.info('ConflictResolver', `Resolving conflict for user ID: ${local.id}`);

    // Decrypt remote metadata for logging purposes (cloud wins metadata)
    const remoteName = decryptField(remote.name_encrypted);
    const remoteRole = decryptField(remote.role_encrypted);

    Logger.info(
      'ConflictResolver',
      `Metadata Conflict [Cloud Wins]:\n` +
      `- Local: Name='${local.name}', Role='${local.role}'\n` +
      `- Remote: Name='${remoteName}', Role='${remoteRole}'\n` +
      `-> Resolved Metadata: Name='${remoteName}', Role='${remoteRole}'`
    );

    const localLastSeenEpoch = new Date(local.lastSeen).getTime();
    const remoteLastSeenEpoch = remote.last_seen;
    
    let resolvedLastSeen: number;
    let syncStatus: 'synced' | 'pending';

    // Local wins last_seen (the most recent timestamp wins)
    if (localLastSeenEpoch > remoteLastSeenEpoch) {
      resolvedLastSeen = localLastSeenEpoch;
      // Since local is newer, it must be synced back up to the cloud eventually
      syncStatus = 'pending';
      Logger.info(
        'ConflictResolver',
        `Timestamp Conflict [Local wins]: Local last_seen (${local.lastSeen}) is newer than Remote (${new Date(
          remote.last_seen
        ).toISOString()}).`
      );
    } else {
      resolvedLastSeen = remoteLastSeenEpoch;
      syncStatus = 'synced';
      Logger.info(
        'ConflictResolver',
        `Timestamp Conflict [Remote wins]: Remote last_seen (${new Date(
          remote.last_seen
        ).toISOString()}) is newer or equal to Local (${local.lastSeen}).`
      );
    }

    return {
      id: local.id,
      name_encrypted: remote.name_encrypted,
      role_encrypted: remote.role_encrypted,
      partition: remote.partition,
      enrolled_at: remote.enrolled_at,
      last_seen: resolvedLastSeen,
      sync_status: syncStatus,
    };
  }

  /**
   * Resolves conflicts for biometric embedding arrays.
   * Strategy:
   * - Always keep the most recently enrolled embedding.
   */
  public resolveEmbeddingConflict(local: StoredEmbedding, remote: RemoteEmbedding): StoredEmbedding {
    const localTime = new Date(local.enrolledAt).getTime();
    const remoteTime = new Date(remote.enrolledAt).getTime();

    Logger.info('ConflictResolver', `Resolving embedding conflict for user ID: ${local.userId}`);

    if (localTime >= remoteTime) {
      Logger.info(
        'ConflictResolver',
        `Embedding Conflict [Local wins]: Local enrollment (${local.enrolledAt}) is newer or equal to Remote (${remote.enrolledAt}). Keeping local.`
      );
      return local;
    } else {
      Logger.info(
        'ConflictResolver',
        `Embedding Conflict [Remote wins]: Remote enrollment (${remote.enrolledAt}) is newer than Local (${local.enrolledAt}). Replacing with remote.`
      );

      // Convert remote hex vector back to byte array (512 bytes)
      const remoteBytes = this.hexToUint8Array(remote.embeddingBlobHex);
      return {
        userId: remote.userId,
        embeddingBlob: remoteBytes,
        enrolledAt: remote.enrolledAt,
      };
    }
  }

  /**
   * Converts a hex string representation back to a Uint8Array byte buffer.
   */
  private hexToUint8Array(hex: string): Uint8Array {
    const length = hex.length / 2;
    const arr = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      arr[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return arr;
  }
}

export const conflictResolver = ConflictResolver.getInstance();
export { ConflictResolver };
