import { storage } from '../../store';
import { encryptField, decryptField } from '../encryption/FieldCipher';
import { Logger } from '../../utils/logger';

export interface ProvisioningData {
  awsBaseUrl: string;
  deviceId: string;
  deviceSecret: string;
  partition: string;
}

/**
 * Manages the device provisioning lifecycle, saving credentials securely inside MMKV.
 */
class DeviceProvisioner {
  private static instance: DeviceProvisioner;

  private constructor() {}

  public static getInstance(): DeviceProvisioner {
    if (!DeviceProvisioner.instance) {
      DeviceProvisioner.instance = new DeviceProvisioner();
    }
    return DeviceProvisioner.instance;
  }

  /**
   * Checks whether the device is provisioned.
   */
  public isProvisioned(): boolean {
    return storage.getBoolean('device_provisioned') || false;
  }

  /**
   * Provisions the device by encrypting and saving credentials in MMKV.
   */
  public provision(data: ProvisioningData): void {
    try {
      Logger.info('DeviceProvisioner', 'Encrypting and saving credentials...');

      // Store all values encrypted using FieldCipher
      storage.set('aws_base_url', encryptField(data.awsBaseUrl.trim()));
      storage.set('device_id', encryptField(data.deviceId.trim()));
      storage.set('device_secret', encryptField(data.deviceSecret.trim()));
      storage.set('partition', encryptField(data.partition.trim()));

      // Set provision flag
      storage.set('device_provisioned', true);

      Logger.info('DeviceProvisioner', 'Device provisioned successfully.');
    } catch (error) {
      Logger.error('DeviceProvisioner', 'Provisioning configuration failed', error);
      throw error;
    }
  }

  /**
   * Retrieves and decrypts the provisioned credentials from storage.
   */
  public getProvisioningData(): ProvisioningData {
    if (!this.isProvisioned()) {
      return {
        awsBaseUrl: '',
        deviceId: '',
        deviceSecret: '',
        partition: 'AFR-E-02', // fallback partition
      };
    }

    try {
      const encryptedUrl = storage.getString('aws_base_url') || '';
      const encryptedId = storage.getString('device_id') || '';
      const encryptedSecret = storage.getString('device_secret') || '';
      const encryptedPartition = storage.getString('partition') || '';

      return {
        awsBaseUrl: encryptedUrl ? decryptField(encryptedUrl) : '',
        deviceId: encryptedId ? decryptField(encryptedId) : '',
        deviceSecret: encryptedSecret ? decryptField(encryptedSecret) : '',
        partition: encryptedPartition ? decryptField(encryptedPartition) : 'AFR-E-02',
      };
    } catch (error) {
      Logger.error('DeviceProvisioner', 'Failed to decrypt provisioning credentials', error);
      return {
        awsBaseUrl: '',
        deviceId: '',
        deviceSecret: '',
        partition: 'AFR-E-02',
      };
    }
  }

  /**
   * Clears provisioning configuration (useful for factory resets).
   */
  public clearProvisioning(): void {
    storage.remove('aws_base_url');
    storage.remove('device_id');
    storage.remove('device_secret');
    storage.remove('partition');
    storage.remove('device_provisioned');
    Logger.info('DeviceProvisioner', 'Provisioning credentials deleted.');
  }
}

export const deviceProvisioner = DeviceProvisioner.getInstance();
export { DeviceProvisioner };
