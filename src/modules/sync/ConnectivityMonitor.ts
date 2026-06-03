import NetInfo from '@react-native-community/netinfo';
import { Logger } from '../../utils/logger';
import { storage } from '../../store';

/**
 * Singleton to monitor connectivity states and broadcast reconnect events.
 * Persists disconnect timestamps across app restarts to calculate offline periods.
 */
class ConnectivityMonitor {
  private static instance: ConnectivityMonitor;
  private online: boolean = true;
  private reconnectListeners: Set<() => void> = new Set();

  private constructor() {
    // Fetch initial connectivity state on launch
    NetInfo.fetch().then((state) => {
      this.handleConnectivityChange(state.isConnected ?? false);
    });

    // Start listening for network updates
    NetInfo.addEventListener((state) => {
      this.handleConnectivityChange(state.isConnected ?? false);
    });
  }

  public static getInstance(): ConnectivityMonitor {
    if (!ConnectivityMonitor.instance) {
      ConnectivityMonitor.instance = new ConnectivityMonitor();
    }
    return ConnectivityMonitor.instance;
  }

  /**
   * Processes network transitions, records offline start times, and calls listeners.
   */
  private handleConnectivityChange(isConnected: boolean) {
    const previousState = this.online;
    this.online = isConnected;

    if (previousState !== isConnected) {
      const timestamp = new Date().toISOString();
      Logger.info(
        'ConnectivityMonitor',
        `Network status transitioned from ${previousState ? 'ONLINE' : 'OFFLINE'} to ${
          isConnected ? 'ONLINE' : 'OFFLINE'
        } at ${timestamp}`
      );

      if (isConnected) {
        // Online: Reset disconnect tracking in MMKV
        storage.remove('last_disconnect_time');
        
        // Notify reconnect observers
        this.reconnectListeners.forEach((callback) => {
          try {
            callback();
          } catch (err) {
            Logger.error('ConnectivityMonitor', 'Error invoking reconnect listener callback', err);
          }
        });
      } else {
        // Offline: Record disconnect epoch timestamp in MMKV
        storage.set('last_disconnect_time', Date.now());
      }
    }
  }

  /**
   * Returns current connection state.
   */
  public isOnline(): boolean {
    return this.online;
  }

  /**
   * Registers a callback triggered when transitioning from offline to online.
   * Returns an unsubscribe function.
   */
  public onReconnect(callback: () => void): () => void {
    this.reconnectListeners.add(callback);
    return () => {
      this.reconnectListeners.delete(callback);
    };
  }

  /**
   * Measures elapsed duration (ms) since the network disconnected.
   * Returns 0 if currently online or offline timestamp is missing.
   */
  public getOfflineDuration(): number {
    if (this.online) {
      return 0;
    }
    const disconnectTime = storage.getNumber('last_disconnect_time');
    if (!disconnectTime) {
      return 0;
    }
    return Date.now() - disconnectTime;
  }
}

export const connectivityMonitor = ConnectivityMonitor.getInstance();
export { ConnectivityMonitor };
