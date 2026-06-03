import { keyManager } from '../encryption/KeyManager';
import { databaseManager } from './DatabaseManager';
import { purgeManager } from './PurgeManager';

/**
 * Bootstraps the local security and database layers.
 * 1. Initializes the KeyManager (generates or retrieves the AES master key from Keychain).
 * 2. Initializes the DatabaseManager (opens the SQLite database and executes migrations).
 * 3. Executes database maintenance (purging old logs and flagging inactive users).
 */
export async function initDatabase(): Promise<void> {
  const startTime = Date.now();
  console.log('[DatabaseInit] Bootstrapping secure local storage layers...');

  try {
    // A. Load or generate the 256-bit AES master key in Keychain
    await keyManager.initialize();

    // B. Open SQLite database and apply structural schema migrations
    await databaseManager.initialize();

    // C. Execute background maintenance policies asynchronously
    purgeManager.runPurge().catch((purgeError) => {
      console.warn('[DatabaseInit] Non-blocking database purge maintenance failed:', purgeError);
    });

    console.log(`[DatabaseInit] Bootstrapped successfully in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('[DatabaseInit] Critical failure during storage bootstrap:', error);
    throw error;
  }
}

// Re-export repositories and managers for easy client integration
export { databaseManager } from './DatabaseManager';
export { userRepository, wipeStoredEmbeddings } from './UserRepository';
export { authLogRepository } from './AuthLogRepository';
export { syncQueueRepository } from './SyncQueueRepository';
export { purgeManager } from './PurgeManager';
