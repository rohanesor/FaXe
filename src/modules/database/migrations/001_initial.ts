import { Transaction } from 'react-native-quick-sqlite';

/**
 * Migration definition for Version 1 database schema setup.
 */
export const initialMigration = {
  version: 1,
  
  /**
   * Applies the schema changes within a database transaction.
   */
  up: (tx: Transaction): void => {
    // 1. Create Users Table
    // Stores encrypted names, roles, partitions, and GCM-encrypted embedding blobs.
    tx.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name_encrypted TEXT,
        role_encrypted TEXT,
        partition TEXT,
        embedding_blob BLOB,
        enrolled_at INTEGER,
        last_seen INTEGER,
        sync_status TEXT DEFAULT 'pending'
      );
    `);

    // 2. Create Authentication Logs Table
    // Tracks verification scans, similarity scores, liveness scores, and GPS coordinates.
    tx.execute(`
      CREATE TABLE IF NOT EXISTS auth_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        timestamp INTEGER,
        result TEXT,
        confidence REAL,
        liveness_score REAL,
        latitude REAL,
        longitude REAL,
        synced INTEGER DEFAULT 0
      );
    `);

    // 3. Create Sync Queue Table
    // Tracks offline modifications waiting to sync to the server.
    tx.execute(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        action TEXT,
        payload TEXT,
        created_at INTEGER,
        attempts INTEGER DEFAULT 0,
        last_attempt INTEGER
      );
    `);

    // 4. Create Performance Indices
    // Ensures database partition filters and unsynced scans are fast.
    tx.execute(`CREATE INDEX IF NOT EXISTS idx_users_partition ON users(partition);`);
    tx.execute(`CREATE INDEX IF NOT EXISTS idx_auth_logs_synced ON auth_logs(synced);`);
    tx.execute(`CREATE INDEX IF NOT EXISTS idx_sync_queue_attempts ON sync_queue(attempts);`);
    
    console.log('[Migration_001] Tables and indexes created successfully.');
  },

  /**
   * Reverts the schema changes. Dropping all biometric tables.
   */
  down: (tx: Transaction): void => {
    tx.execute(`DROP TABLE IF EXISTS sync_queue;`);
    tx.execute(`DROP TABLE IF EXISTS auth_logs;`);
    tx.execute(`DROP TABLE IF EXISTS users;`);
    console.log('[Migration_001] Tables dropped successfully.');
  }
};
