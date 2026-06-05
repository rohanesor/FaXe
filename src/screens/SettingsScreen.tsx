import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  Switch,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { useMMKVBoolean } from 'react-native-mmkv';
import { useIsFocused } from '@react-navigation/native';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { storage } from '../store';
import { runRecognitionBenchmark } from '../modules/recognition';
import { deviceProvisioner } from '../modules/sync/DeviceProvisioner';
import { connectivityMonitor } from '../modules/sync/ConnectivityMonitor';
import { syncEngine } from '../modules/sync/SyncEngine';
import { userRepository } from '../modules/database/UserRepository';
import { authLogRepository } from '../modules/database/AuthLogRepository';
import { syncQueueRepository } from '../modules/database/SyncQueueRepository';
import { purgeManager } from '../modules/database/PurgeManager';
import { databaseManager } from '../modules/database/DatabaseManager';
import { formatDuration, formatRelativeTime } from '../utils/formatters';
import { Logger } from '../utils/logger';
import { Toast } from '../components/Toast';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = StackScreenProps<MainStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const [, setIsAdminMode] = useMMKVBoolean('isAdminMode', storage);
  const [debugMode, setDebugMode] = useMMKVBoolean('debug_mode', storage);
  const isFocused = useIsFocused();

  // Settings metrics states
  const [userCount, setUserCount] = useState(0);
  const [logCount, setLogCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [offlineDuration, setOfflineDuration] = useState(0);
  const [isOnline, setIsOnline] = useState(connectivityMonitor.isOnline());
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  // Operation progress states
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');

  // Collapsible dev tools
  const [devToolsExpanded, setDevToolsExpanded] = useState(false);

  const provData = deviceProvisioner.getProvisioningData();

  const fetchMetrics = async () => {
    try {
      const uCount = await userRepository.getUsersCount();
      const lCount = await authLogRepository.getLogsCount();
      const pCount = await syncQueueRepository.getPendingCount();

      setUserCount(uCount);
      setLogCount(lCount);
      setPendingCount(pCount);

      const offDur = connectivityMonitor.getOfflineDuration();
      setOfflineDuration(offDur);
      setIsOnline(connectivityMonitor.isOnline());
      setLastSyncTime(syncEngine.getLastSyncTime());
    } catch (err) {
      Logger.error('SettingsScreen', 'Failed to fetch settings metrics', err);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchMetrics();
    }
  }, [isFocused]);

  useEffect(() => {
    let interval: any;
    if (isFocused) {
      interval = setInterval(() => {
        setOfflineDuration(connectivityMonitor.getOfflineDuration());
        setIsOnline(connectivityMonitor.isOnline());
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isFocused]);

  const truncateUrl = (url: string) => {
    if (!url) return 'Not Provisioned';
    return url.length > 20 ? url.substring(0, 20) + '...' : url;
  };

  const toggleDevTools = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDevToolsExpanded(!devToolsExpanded);
  };

  const handleManualSync = async () => {
    if (!isOnline) {
      Alert.alert('Offline Mode', 'Device is currently offline. Cannot force cloud synchronization.');
      return;
    }
    setIsSyncing(true);
    try {
      const report = await syncEngine.runSync();
      await fetchMetrics();
      if (report.error) {
        Toast.show({
          message: `Sync warning: ${report.error}`,
          type: 'error',
        });
      } else {
        Toast.show({
          message: `Sync succeeded. Pushed ${report.pushedLogs} logs.`,
          type: 'success',
        });
      }
    } catch (err: any) {
      Logger.error('SettingsScreen', 'Manual sync failed', err);
      Toast.show({
        message: 'Manual sync execution failed.',
        type: 'error',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRunPurge = async () => {
    setIsPurging(true);
    try {
      const deletedLogsCount = await purgeManager.runPurge();
      await fetchMetrics();
      Toast.show({
        message: `Database purge completed. Cleaned ${deletedLogsCount} synced logs from SQLite.`,
        type: 'success',
      });
    } catch (err: any) {
      Logger.error('SettingsScreen', 'Manual database purge failed', err);
      Toast.show({
        message: 'Database purge operation failed.',
        type: 'error',
      });
    } finally {
      setIsPurging(false);
    }
  };

  const handleEnterAdminMode = () => {
    setIsAdminMode(true);
  };

  const handleFactoryReset = async () => {
    if (confirmDeleteText !== 'DELETE') {
      Alert.alert('Confirmation Required', 'Please type DELETE in the input field to confirm factory reset.');
      return;
    }

    Alert.alert(
      'Confirm Factory Reset',
      'This will permanently erase all local enrolled users, audit logs, and sync queues. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              Logger.warn('SettingsScreen', 'Triggering terminal factory reset...');
              const db = databaseManager.getDB();
              await db.transaction(async (tx) => {
                tx.execute('DELETE FROM users;');
                tx.execute('DELETE FROM auth_logs;');
                tx.execute('DELETE FROM sync_queue;');
              });

              storage.remove('isAdminMode');
              storage.remove('debug_mode');
              storage.remove('last_sync');
              storage.remove('last_sync_report');

              setConfirmDeleteText('');
              await fetchMetrics();

              Toast.show({
                message: 'Factory reset completed. Local database and parameters wiped.',
                type: 'success',
              });
            } catch (err: any) {
              Logger.error('SettingsScreen', 'Factory reset execution failed', err);
              Alert.alert('Reset Failed', 'Could not clear data: ' + err.message);
            }
          },
        },
      ]
    );
  };

  // ─── Row Components ─────────────────────────────────────
  const SettingRow = ({ label, value, valueStyle }: { label: string; value: string; valueStyle?: any }) => (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueStyle]} numberOfLines={1} ellipsizeMode="tail">
        {value}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Device Settings</Text>
          <Text style={styles.subtitle}>SYSTEM CONFIGURATION</Text>
        </View>

        {/* ─── SECTION 1: DEVICE IDENTITY ─────────────────── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>DEVICE IDENTITY</Text>
          <SettingRow label="Device ID" value={provData.deviceId || 'Not Configured'} valueStyle={styles.monoValue} />
          <SettingRow label="Partition Zone" value={provData.partition || 'Not Configured'} />
          <SettingRow label="AWS Endpoint" value={truncateUrl(provData.awsBaseUrl)} valueStyle={styles.monoValue} />
          <SettingRow label="Database Version" value="v1.12.0-sqlite" />
        </View>

        {/* ─── SECTION 2: CONNECTIVITY ────────────────────── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>CONNECTIVITY</Text>
          <SettingRow
            label="Network Status"
            value={isOnline ? 'Online' : 'Offline'}
            valueStyle={isOnline ? styles.valueOnline : styles.valueOffline}
          />
          <SettingRow label="Offline Duration" value={formatDuration(offlineDuration)} />
          <SettingRow
            label="Last Cloud Sync"
            value={lastSyncTime ? formatRelativeTime(lastSyncTime) : 'Never'}
          />
          <SettingRow label="Auto-Sync Interval" value="Every 15 minutes" />
        </View>

        {/* ─── SECTION 3: LOCAL STORAGE METRICS ───────────── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>LOCAL STORAGE METRICS</Text>
          <SettingRow label="Enrolled Users" value={String(userCount)} />
          <SettingRow label="Auth Log Entries" value={String(logCount)} />
          <SettingRow
            label="Pending Sync Queue"
            value={String(pendingCount)}
            valueStyle={pendingCount > 0 ? styles.valuePending : undefined}
          />
          <SettingRow label="Storage Used" value={`${((userCount * 0.6 + logCount * 0.1) / 1024 * 100).toFixed(1)} KB`} />
        </View>

        {/* ─── SECTION 4: DEVELOPER TOOLS (Collapsible) ───── */}
        <View style={styles.sectionCard}>
          <Pressable style={styles.accordionHeader} onPress={toggleDevTools}>
            <Text style={styles.sectionLabel}>DEVELOPER TOOLS</Text>
            <Text style={styles.accordionChevron}>{devToolsExpanded ? '▼' : '▶'}</Text>
          </Pressable>

          {devToolsExpanded && (
            <View style={styles.accordionBody}>
              <View style={styles.switchRow}>
                <View style={styles.switchTextContainer}>
                  <Text style={styles.rowLabel}>Debug Mode</Text>
                  <Text style={styles.switchSubtext}>Enables verbose terminal tracing</Text>
                </View>
                <Switch
                  value={debugMode || false}
                  onValueChange={setDebugMode}
                  trackColor={{ false: '#333', true: '#00E5FF' }}
                  thumbColor={debugMode ? '#FFFFFF' : '#A0A0A0'}
                />
              </View>

              <Button
                label="View Telemetry Dashboard"
                onPress={() => navigation.navigate('MetricsDashboard')}
                variant="outline"
                style={styles.devBtn}
              />

              <Button
                label="Switch to Admin Dashboard"
                onPress={handleEnterAdminMode}
                variant="outline"
                style={styles.devBtn}
              />
            </View>
          )}
        </View>

        {/* ─── SECTION 5: OPERATIONS ──────────────────────── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>OPERATIONS</Text>

          <Button
            label={isSyncing ? 'Syncing...' : 'Force Manual Sync Now'}
            onPress={handleManualSync}
            disabled={isSyncing}
            variant="outline"
            style={styles.opBtn}
          />

          <Button
            label={isPurging ? 'Purging Cache...' : 'Clean Synced Logs'}
            onPress={handleRunPurge}
            disabled={isPurging}
            variant="outline"
            style={styles.opBtn}
          />
        </View>

        {/* ─── SECTION 6: DANGER ZONE ─────────────────────── */}
        <View style={[styles.sectionCard, styles.dangerCard]}>
          <Text style={styles.dangerLabel}>DANGER ZONE</Text>
          <Text style={styles.dangerDescription}>
            A factory reset clears all local enrolled users, local audit logs, and synchronization
            queues from the SQLite database. Configured provisioning credentials will be retained.
          </Text>

          <TextInput
            style={styles.dangerInput}
            placeholder='Type "DELETE" to authorize reset'
            placeholderTextColor="#666666"
            value={confirmDeleteText}
            onChangeText={setConfirmDeleteText}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Pressable
            style={[
              styles.dangerBtn,
              confirmDeleteText !== 'DELETE' ? styles.dangerBtnDisabled : null,
            ]}
            onPress={handleFactoryReset}
            disabled={confirmDeleteText !== 'DELETE'}
          >
            <Text style={styles.dangerBtnText}>Factory Reset Local Cache</Text>
          </Pressable>
        </View>

        <Button
          label="Back to Operations"
          onPress={() => navigation.goBack()}
          variant="outline"
          style={styles.backBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    flexGrow: 1,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontFamily: 'System',
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
    color: '#00E5FF',
    letterSpacing: 1.5,
    marginTop: 2,
  },

  // ─── Section Cards ──────────────────────────────────────
  sectionCard: {
    backgroundColor: '#111111',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: '700',
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  // ─── Rows ───────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222222',
  },
  rowLabel: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
  rowValue: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#888888',
    fontWeight: '600',
    textAlign: 'right',
    maxWidth: '55%',
  },
  monoValue: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  valueOnline: {
    color: '#00C853',
  },
  valueOffline: {
    color: '#FF3B3B',
  },
  valuePending: {
    color: '#FF9100',
  },

  // ─── Accordion (Dev Tools) ──────────────────────────────
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accordionChevron: {
    color: '#666666',
    fontSize: 12,
    marginBottom: 12,
  },
  accordionBody: {
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222222',
    marginBottom: 10,
  },
  switchTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  switchSubtext: {
    fontFamily: 'System',
    fontSize: 11,
    color: '#555555',
    marginTop: 2,
  },
  devBtn: {
    height: 42,
    marginVertical: 4,
  },

  // ─── Operations ─────────────────────────────────────────
  opBtn: {
    height: 46,
    marginVertical: 6,
  },

  // ─── Danger Zone ────────────────────────────────────────
  dangerCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 59, 0.25)',
    backgroundColor: 'rgba(255, 59, 59, 0.03)',
  },
  dangerLabel: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: '700',
    color: '#FF3B3B',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  dangerDescription: {
    fontFamily: 'System',
    fontSize: 12,
    color: '#A0A0A0',
    lineHeight: 16,
    marginBottom: 16,
  },
  dangerInput: {
    height: 46,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#FF3B3B',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 14,
    marginBottom: 12,
  },
  dangerBtn: {
    height: 46,
    backgroundColor: '#FF3B3B',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dangerBtnDisabled: {
    backgroundColor: '#3D1515',
  },
  dangerBtnText: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
  },

  // ─── Back Button ────────────────────────────────────────
  backBtn: {
    marginTop: 10,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#333333',
  },
});
