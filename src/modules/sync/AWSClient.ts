// src/modules/sync/AWSClient.ts
import axios, { AxiosInstance } from 'axios';
import { storage } from '../../store'; // MMKV instance
import { Logger } from '../../utils/logger';
import { deviceProvisioner } from './DeviceProvisioner';

const BASE_URL = 'https://fnjzuczhef.execute-api.ap-south-1.amazonaws.com/prod';
const MODULE = 'AWSClient';

// Custom error wrapper for AWS operations, flagging retry status.
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

// RemoteUser format returned from AWS synchronization queries.
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

class AWSClient {
  private client: AxiosInstance;
  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleAxiosError(error: any, path: string): never {
    let message = error.message || 'Unknown network error';
    let code = 0;
    let retryable = true;

    if (axios.isCancel(error) || error.code === 'ECONNABORTED') {
      Logger.error(MODULE, `HTTP request timed out after 10s: ${path}`);
      throw new AWSError('Request timed out after 10 seconds.', 408, true);
    }

    if (error.response) {
      code = error.response.status;
      message = error.response.data?.message || error.response.statusText || message;
      
      // 403 authentication codes are non-retryable; 401 will be retried with fresh token
      if (code === 403) {
        retryable = false;
      }
    } else if (error.request) {
      // Request sent but no response (offline socket issues)
      code = 408;
      retryable = true;
    }

    Logger.error(MODULE, `HTTP request to ${path} failed (${code}): ${message}`);
    throw new AWSError(message, code, retryable);
  }

  // ─── Device Authentication ────────────────────────────────

  async authenticateDevice(): Promise<string> {
    // Return cached token if still valid (5 min buffer)
    if (this.cachedToken && Date.now() < this.tokenExpiry - 300000) {
      return this.cachedToken;
    }

    const deviceId = storage.getString('device_id');
    const deviceSecret = storage.getString('device_secret');

    if (!deviceId || !deviceSecret) {
      throw new AWSError('Device credentials are missing. Provision device first.', 400, false);
    }

    Logger.info(MODULE, `Authenticating device: ${deviceId}`);

    try {
      const response = await this.client.post('/auth-device', {
        deviceId,
        deviceSecret,
      });

      this.cachedToken = response.data.token;
      // JWT expires in 24h, store expiry time
      this.tokenExpiry = Date.now() + (response.data.expiresIn * 1000);

      Logger.info(MODULE, 'Device authenticated successfully');
      return this.cachedToken!;
    } catch (error: any) {
      this.handleAxiosError(error, '/auth-device');
    }
  }

  // ─── Push Auth Logs ───────────────────────────────────────

  async pushAuthLogs(logs: any[]): Promise<void> {
    const token = await this.authenticateDevice();
    const partition = deviceProvisioner.getProvisioningData().partition || 'DEFAULT';

    // Add partition to each log
    const logsWithPartition = logs.map(log => ({ ...log, partition }));

    Logger.info(MODULE, `Pushing ${logs.length} auth logs`);

    try {
      await this.client.post('/push-auth-logs', {
        logs: logsWithPartition,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      Logger.info(MODULE, 'Auth logs pushed successfully');
    } catch (error: any) {
      this.handleAxiosError(error, '/push-auth-logs');
    }
  }

  // ─── Push Queue Item ──────────────────────────────────────

  async pushQueueItem(item: any): Promise<void> {
    const token = await this.authenticateDevice();

    Logger.info(MODULE, `Pushing queue item: ${item.action}`);

    try {
      await this.client.post('/push-sync-queue', {
        action: item.action,
        payload: typeof item.payload === 'string'
          ? JSON.parse(item.payload)
          : item.payload,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      Logger.info(MODULE, 'Queue item pushed successfully');
    } catch (error: any) {
      // On 401, clear token and retry exactly once with fresh credentials
      if (error.response && error.response.status === 401) {
        Logger.warn(MODULE, '401 received on pushQueueItem — refreshing token and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        const freshToken = await this.authenticateDevice();

        try {
          await this.client.post('/push-sync-queue', {
            action: item.action,
            payload: typeof item.payload === 'string'
              ? JSON.parse(item.payload)
              : item.payload,
          }, {
            headers: { Authorization: `Bearer ${freshToken}` },
          });
          Logger.info(MODULE, 'Queue item pushed successfully after token refresh');
          return;
        } catch (retryError: any) {
          this.handleAxiosError(retryError, '/push-sync-queue (retry)');
        }
      }
      this.handleAxiosError(error, '/push-sync-queue');
    }
  }

  // ─── Pull Updated Users ───────────────────────────────────

  async pullUpdatedUsers(partition: string, since: number): Promise<RemoteUser[]> {
    const token = await this.authenticateDevice();

    Logger.info(MODULE, `Pulling users for partition: ${partition} since: ${since}`);

    try {
      const response = await this.client.get('/pull-users', {
        headers: { Authorization: `Bearer ${token}` },
        params: { partition, since },
      });

      Logger.info(MODULE, `Pulled ${response.data.count} users`);
      return response.data.users || [];
    } catch (error: any) {
      // On 401, clear token and retry exactly once
      if (error.response && error.response.status === 401) {
        Logger.warn(MODULE, '401 received on pullUpdatedUsers — refreshing token and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        const freshToken = await this.authenticateDevice();

        try {
          const retryResponse = await this.client.get('/pull-users', {
            headers: { Authorization: `Bearer ${freshToken}` },
            params: { partition, since },
          });
          Logger.info(MODULE, `Pulled ${retryResponse.data.count} users after token refresh`);
          return retryResponse.data.users || [];
        } catch (retryError: any) {
          this.handleAxiosError(retryError, '/pull-users (retry)');
        }
      }
      this.handleAxiosError(error, '/pull-users');
    }
  }
}

export const awsClient = new AWSClient();
