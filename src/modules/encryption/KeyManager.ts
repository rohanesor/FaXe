import * as Keychain from 'react-native-keychain';

/**
 * Custom error class for key management operations.
 */
export class KeyManagerError extends Error {
  public code: 'KEY_NOT_FOUND' | 'KEYCHAIN_ACCESS_FAILED' | 'GENERATION_FAILED';

  constructor(code: 'KEY_NOT_FOUND' | 'KEYCHAIN_ACCESS_FAILED' | 'GENERATION_FAILED', message: string) {
    super(message);
    this.name = 'KeyManagerError';
    this.code = code;
  }
}

/**
 * Singleton class managing the cryptographic master key lifecycle.
 * Securely stores the 256-bit AES master key inside Android Keystore / iOS Keychain.
 */
class KeyManager {
  private static instance: KeyManager;
  private cachedMasterKey: string | null = null;
  private initialized: boolean = false;
  private readonly SERVICE_NAME = 'datalake_master_service';
  private readonly KEY_ID = 'datalake_master_key';

  private constructor() {}

  /**
   * Retrieves the singleton instance of KeyManager.
   */
  public static getInstance(): KeyManager {
    if (!KeyManager.instance) {
      KeyManager.instance = new KeyManager();
    }
    return KeyManager.instance;
  }

  /**
   * Initializes the KeyManager. Loads the key from the Keychain if it exists,
   * or generates a new one on first launch.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      console.log('[KeyManager] Initializing and attempting to retrieve master key from Keychain...');
      
      // Try to fetch existing master key from Secure Keychain
      const credentials = await Keychain.getGenericPassword({
        service: this.SERVICE_NAME,
      });

      if (credentials) {
        this.cachedMasterKey = credentials.password;
        this.initialized = true;
        console.log('[KeyManager] Master key retrieved successfully from Keychain.');
        return;
      }

      // If credentials do not exist, this is the first launch. We generate a new key.
      console.log('[KeyManager] No master key found. First launch detected. Generating a new key...');
      const generatedKey = this.generate256BitKey();

      // Store in Keystore/Secure Enclave
      await Keychain.setGenericPassword(this.KEY_ID, generatedKey, {
        service: this.SERVICE_NAME,
        accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
      });

      this.cachedMasterKey = generatedKey;
      this.initialized = true;
      console.log('[KeyManager] New 256-bit master key generated and stored securely.');
    } catch (error: any) {
      console.warn('[KeyManager] Failed to retrieve key, resetting secure storage entry:', error);
      try {
        await Keychain.resetGenericPassword({ service: this.SERVICE_NAME });
      } catch (resetErr) {
        console.error('[KeyManager] Failed to reset secure storage:', resetErr);
      }
      
      console.log('[KeyManager] Generating a new key after recovery...');
      const generatedKey = this.generate256BitKey();
      await Keychain.setGenericPassword(this.KEY_ID, generatedKey, {
        service: this.SERVICE_NAME,
        accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
      });
      this.cachedMasterKey = generatedKey;
      this.initialized = true;
      console.log('[KeyManager] New master key generated successfully during recovery.');
    }
  }

  /**
   * Generates a secure, 256-bit random key (represented as a 64-character hex string)
   * using the native platform's secure random number generator.
   */
  private generate256BitKey(): string {
    const bytes = new Uint8Array(32); // 32 bytes * 8 = 256 bits
    
    // Use the native Web Crypto getRandomValues interface provided by newer React Native runtimes
    const cryptoObj = (globalThis as any).crypto;
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      cryptoObj.getRandomValues(bytes);
    } else {
      throw new KeyManagerError(
        'GENERATION_FAILED',
        'Secure random number generation is not supported in the current JavaScript runtime environment.'
      );
    }

    // Convert Uint8Array to hex string representation
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Exposes the master key asynchronously.
   */
  public async getMasterKey(): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.cachedMasterKey) {
      throw new KeyManagerError('KEY_NOT_FOUND', 'Master key is uninitialized or could not be loaded.');
    }
    return this.cachedMasterKey;
  }

  /**
   * Exposes the master key synchronously. Relies on initialize() having run during app boot.
   * Throws if the master key has not been cached in memory.
   */
  public getMasterKeySync(): string {
    if (!this.initialized || !this.cachedMasterKey) {
      throw new KeyManagerError('KEY_NOT_FOUND', 'Master key has not been loaded into memory. Call initialize() first.');
    }
    return this.cachedMasterKey;
  }

  /**
   * Returns whether the KeyManager has loaded the key in memory.
   */
  public isInitialized(): boolean {
    return this.initialized && this.cachedMasterKey !== null;
  }

  /**
   * Wipes the cached master key in memory for security during sign-outs or app locks.
   */
  public lockCachedKey(): void {
    this.cachedMasterKey = null;
    this.initialized = false;
    console.log('[KeyManager] Cached master key wiped from runtime memory.');
  }
}

export const keyManager = KeyManager.getInstance();
