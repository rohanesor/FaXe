import axios from 'axios';
import { storage } from '../../store';
import { decryptField } from '../encryption/FieldCipher';
import { Logger } from '../../utils/logger';
import { AuthLog, SyncQueueItem } from '../../types';

/**
 * RemoteUser format returned from AWS synchronization queries.
 */
export interface RemoteUser {
  id: string;
  name_encrypted: string;
  role_encrypted: string;
  partition: string;
  embedding_blob_hex?: string; // hex-encoded vector blob
  enrolled_at: number;
  last_seen: number;
  deleted?: boolean;
}

/**
 * Custom error wrapper for AWS operations, flagging retry status.
 */
export class AWSError extends Error {
  public code: number;
  public retryable: boolean;

  constructor(message: string, code: number, retryable: boolean) {
    super(message);
    this.name = 'AWSError';
    this.code = code;
    this.retryable = retryable;
  }
}

let cachedToken: string | null = null;
let tokenExpiryEpoch: number = 0;

/**
 * HTTP Client mapping remote endpoints.
 * Handles device authorization, payloads pushing, and user updates queries.
 */
class AWSClient {
  private static instance: AWSClient;

  private constructor() {}

  public static getInstance(): AWSClient {
    if (!AWSClient.instance) {
      AWSClient.instance = new AWSClient();
    }
    return AWSClient.instance;
  }

  /**
   * Retrieves and decrypts the AWS base URL configuration from MMKV.
   */
  private getBaseURL(): string {
    const encryptedUrl = storage.getString('aws_base_url');
    if (!encryptedUrl) {
      throw new AWSError('AWS Base URL is not configured. Provision device first.', 400, false);
    }
    return decryptField(encryptedUrl);
  }

  /**
   * Retrieves and decrypts the provisioned device credentials from MMKV.
   */
  private getDeviceCredentials(): { deviceId: string; deviceSecret: string } {
    const encryptedId = storage.getString('device_id');
    const encryptedSecret = storage.getString('device_secret');

    if (!encryptedId || !encryptedSecret) {
      throw new AWSError('Device credentials are missing. Provision device first.', 400, false);
    }

    return {
      deviceId: decryptField(encryptedId),
      deviceSecret: decryptField(encryptedSecret),
    };
  }

  /**
   * Wraps Axios requests with AbortController for 10-second timeout enforcement.
   */
  private async executeRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    data?: any,
    requireAuth: boolean = true
  ): Promise<T> {
    const baseUrl = this.getBaseURL();
    const url = `${baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (requireAuth) {
      const token = await this.getValidToken();
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 10000); // 10-second timeout

    try {
      Logger.info('AWSClient', `Executing HTTP ${method} to ${path}`);
      
      const response = await axios({
        method,
        url,
        data,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.data;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (axios.isCancel(error)) {
        Logger.error('AWSClient', `HTTP request timed out after 10s: ${path}`);
        throw new AWSError('Request timed out after 10 seconds.', 408, true);
      }

      let message = error.message || 'Unknown network error';
      let code = 0;
      let retryable = true;

      if (error.response) {
        code = error.response.status;
        message = error.response.data?.message || error.response.statusText || message;
        
        // 401 & 403 authentication codes are non-retryable
        if (code === 401 || code === 403) {
          retryable = false;
        }
      } else if (error.request) {
        // Request sent but no response (offline socket issues)
        code = 408;
        retryable = true;
      }

      Logger.error('AWSClient', `HTTP request failed (${code}): ${message}`);
      throw new AWSError(message, code, retryable);
    }
  }

  /**
   * Fetches or retrieves the cached JWT authorization token.
   */
  private async getValidToken(): Promise<string> {
    if (cachedToken && Date.now() < tokenExpiryEpoch) {
      return cachedToken;
    }
    return this.authenticateDevice();
  }

  /**
   * Phase 1: Authenticates the device using stored credentials.
   */
  public async authenticateDevice(): Promise<string> {
    const { deviceId, deviceSecret } = this.getDeviceCredentials();
    
    try {
      const response = await this.executeRequest<{ token: string }>(
        'POST',
        '/auth/device',
        { device_id: deviceId, device_secret: deviceSecret },
        false
      );

      cachedToken = response.token;
      // Cache token locally for 50 minutes (tokens expire in 1 hr)
      tokenExpiryEpoch = Date.now() + 50 * 60 * 1000;
      
      Logger.info('AWSClient', 'Device authenticated successfully with cloud.');
      return response.token;
    } catch (error) {
      Logger.error('AWSClient', 'Failed to authenticate device', error);
      throw error;
    }
  }

  /**
   * Phase 2: Pushes a batch of verification logs to the server.
   */
  public async pushAuthLogs(logs: AuthLog[]): Promise<void> {
    await this.executeRequest<void>('POST', '/sync/auth-logs', { batch: logs });
    Logger.info('AWSClient', `Successfully pushed batch of ${logs.length} logs.`);
  }

  /**
   * Phase 3: Pushes a single sync queue modification item.
   */
  public async pushQueueItem(item: SyncQueueItem): Promise<void> {
    await this.executeRequest<void>('POST', '/sync/queue', {
      id: item.id,
      action: item.action,
      payload: JSON.parse(item.payload),
    });
    Logger.info('AWSClient', `Successfully pushed queue item: ${item.id} (${item.action})`);
  }

  /**
   * Phase 4: Pulls enrollment database changes since a previous sync timestamp.
   */
  public async pullUpdatedUsers(partition: string, since: number): Promise<RemoteUser[]> {
    const path = `/sync/users?partition=${encodeURIComponent(partition)}&since=${since}`;
    const response = await this.executeRequest<{ users: RemoteUser[] }>('GET', path);
    Logger.info('AWSClient', `Retrieved ${response.users?.length ?? 0} updated users from cloud.`);
    return response.users || [];
  }
}

export const awsClient = AWSClient.getInstance();
export { AWSClient };
