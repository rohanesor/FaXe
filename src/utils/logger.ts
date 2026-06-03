import { storage } from '../store';

/**
 * Structured logger utility for DatalakeFaceAuth.
 * Formats logs with [DatalakeFaceAuth][MODULE][LEVEL] prefixes.
 * Filters out INFO messages in production when debug_mode is disabled.
 */
export class Logger {
  /**
   * Retrieves the debug mode setting from MMKV storage (defaults to true).
   */
  private static isDebugMode(): boolean {
    const debug = storage.getBoolean('debug_mode');
    return debug === undefined ? true : debug;
  }

  /**
   * Log informational messages (suppressed in production debug_mode = false).
   */
  public static info(module: string, message: string): void {
    if (this.isDebugMode()) {
      console.log(`[DatalakeFaceAuth][${module.toUpperCase()}][INFO] ${message}`);
    }
  }

  /**
   * Log warning messages (always logged).
   */
  public static warn(module: string, message: string): void {
    console.warn(`[DatalakeFaceAuth][${module.toUpperCase()}][WARN] ${message}`);
  }

  /**
   * Log error messages (always logged, with optional error payload stack trace).
   */
  public static error(module: string, message: string, error?: any): void {
    const errorSuffix = error ? `\nDetails: ${error.message || error}\n${error.stack || ''}` : '';
    console.error(`[DatalakeFaceAuth][${module.toUpperCase()}][ERROR] ${message}${errorSuffix}`);
  }
}
