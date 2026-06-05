import { open, QuickSQLiteConnection } from 'react-native-quick-sqlite';
import { initialMigration } from './migrations/001_initial';

/**
 * Singleton database manager orchestrating SQLite initialization and schema updates.
 * Leverages react-native-quick-sqlite for high-performance JSI connection execution.
 */
class DatabaseManager {
  private static instance: DatabaseManager;
  private db: QuickSQLiteConnection | null = null;
  private openTimeMs: number = 0;
  private initialized: boolean = false;
  private readonly DB_NAME = 'datalake.db';

  private constructor() {}

  /**
   * Retrieves the singleton instance of DatabaseManager.
   */
  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Opens the SQLite connection and executes schema migrations.
   * Logs database load times in milliseconds.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const startTime = Date.now();
    try {
      console.log(`[DatabaseManager] Opening JSI connection to ${this.DB_NAME}...`);
      this.db = open({ name: this.DB_NAME });
      this.openTimeMs = Date.now() - startTime;
      console.log(`[DatabaseManager] SQLite database opened in ${this.openTimeMs}ms`);

      // Enable WAL mode for better read concurrency
      this.db.execute('PRAGMA journal_mode=WAL;');
      console.log('[DatabaseManager] WAL mode enabled.');

      // Execute migration manager
      await this.runMigrations();

      // Run diagnostics to log blob health
      this.runDiagnostic();

      this.initialized = true;
    } catch (error) {
      console.error('[DatabaseManager] SQLite database startup failed:', error);
      throw error;
    }
  }

  /**
   * Evaluates schema versions and runs migration batches.
   */
  private async runMigrations(): Promise<void> {
    const database = this.getDB();

    // Enforce initial schema tracking structure
    database.execute(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER
      );
    `);

    // Retrieve maximum applied migration
    const result = database.execute('SELECT MAX(version) as max_version FROM schema_version;');
    const row = result.rows?.item(0);
    const currentVersion = row?.max_version ?? 0;

    console.log(`[DatabaseManager] Active database schema version is: ${currentVersion}`);

    // Batch apply migrations in serial sequence
    if (currentVersion < 1) {
      console.log('[DatabaseManager] Applying Migration 001...');
      
      // Execute migration steps inside an atomic database transaction
      await database.transaction(async (tx) => {
        initialMigration.up(tx);
        tx.execute(
          'INSERT INTO schema_version (version, applied_at) VALUES (?, ?);',
          [1, Date.now()]
        );
      });
      
      console.log('[DatabaseManager] Migration 001 applied successfully.');
    }
  }

  /**
   * Retrieves the active database connection instance. Throws if not initialized.
   */
  public getDB(): QuickSQLiteConnection {
    if (!this.db) {
      throw new Error('DATABASE_NOT_READY: SQLite database is not loaded. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Returns connection setup latency in milliseconds.
   */
  public getOpenTimeMs(): number {
    return this.openTimeMs;
  }

  /**
   * Checks if the database is open and ready for queries.
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Closes database connections.
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      console.log('[DatabaseManager] Database connection closed.');
    }
  }

  /**
   * Diagnostic utility: logs the first 10 users' blob sizes and sync status.
   * Called at startup and after enrollment to verify data integrity.
   */
  public runDiagnostic(): void {
    try {
      const db = this.getDB();
      const result = db.execute(
        'SELECT id, length(embedding_blob) as blob_size, sync_status FROM users LIMIT 10;'
      );
      const len = result.rows?.length ?? 0;
      console.log(`[DatabaseManager][DIAGNOSTIC] Users table sample (${len} rows):`);
      for (let i = 0; i < len; i++) {
        const row = result.rows?.item(i);
        console.log(`  [${i}] id=${row.id}, blob_size=${row.blob_size}, sync_status=${row.sync_status}`);
      }
    } catch (error) {
      console.warn('[DatabaseManager][DIAGNOSTIC] Diagnostic query failed (table may not exist yet):', error);
    }
  }
}

export const databaseManager = DatabaseManager.getInstance();
