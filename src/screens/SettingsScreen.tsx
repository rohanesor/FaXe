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
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');

  const [benchmarkResults, setBenchmarkResults] = useState<{
    totalCandidates: number;
    positiveMatchTimeMs: number;
    negativeMatchTimeMs: number;
    throughputScore: number;
  } | null>(null);

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

  // Update offline duration timer dynamically while on settings screen
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

  const maskUrl = (url: string) => {
    if (!url) return 'Not Provisioned';
    try {
      const parts = url.split('://');
      if (parts.length < 2) return '***';
      const protocol = parts[0];
      const domainAndPath = parts[1];
      const domainParts = domainAndPath.split('/');
      const domain = domainParts[0];
      const path = domainParts.slice(1).join('/');
      
      let maskedDomain = domain;
      if (domain.length > 6) {
        maskedDomain = `${domain.slice(0, 3)}***${domain.slice(-3)}`;
      } else {
        maskedDomain = '***';
      }
      return `${protocol}://${maskedDomain}${path ? '/' + path : ''}`;
    } catch {
      return '***';
    }
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

  const handleRunBenchmark = () => {
    setIsBenchmarking(true);
    setTimeout(() => {
      try {
        const results = runRecognitionBenchmark();
        setBenchmarkResults(results);
        Alert.alert(
          'Benchmark Success',
          `Linear search across 5,000 users complete!\n\nMatch scan: ${results.positiveMatchTimeMs}ms\nMismatch scan: ${results.negativeMatchTimeMs}ms\nThroughput: ${results.throughputScore} scans/sec`
        );
      } catch (err: any) {
        Logger.error('SettingsScreen', 'Benchmark run failed', err);
        Alert.alert('Benchmark Failed', err.message || 'An unexpected error occurred.');
      } finally {
        setIsBenchmarking(false);
      }
    }, 100);
  };

  const handleEnterAdminMode = () => {
    setIsAdminMode(true);
  };

  const handleFactoryReset = async () => {
    if (confirmDeleteText !== 'DELETE') {
      Alert.alert('Confirmation Required', 'Please type DELETE in the input field to confirm factory reset.');
      return;
    }

    try {
      Logger.warn('SettingsScreen', 'Triggering terminal factory reset...');
      const db = databaseManager.getDB();
      await db.transaction(async (tx) => {
        tx.execute('DELETE FROM users;');
        tx.execute('DELETE FROM auth_logs;');
        tx.execute('DELETE FROM sync_queue;');
      });

      // Clear non-provisioning MMKV configurations
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
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Device Settings</Text>
          <Text style={styles.subtitle}>HARDWARE CONFIGURATION</Text>
        </View>

        {/* Section 1: System Parameters */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>System Parameters</Text>
          
          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Device ID</Text>
            <Text style={styles.paramValue}>{provData.deviceId || 'Not Configured'}</Text>
          </View>

          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Partition Code</Text>
            <Text style={styles.paramValue}>{provData.partition || 'Not Configured'}</Text>
          </View>

          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>AWS Base URL</Text>
            <Text style={styles.paramValue} numberOfLines={1} ellipsizeMode="middle">
              {maskUrl(provData.awsBaseUrl)}
            </Text>
          </View>

          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Cache Database Version</Text>
            <Text style={styles.paramValue}>v1.12.0-sqlite</Text>
          </View>
        </View>

        {/* Section 2: Connectivity & Diagnostics */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Diagnostics & Network</Text>

          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Network Status</Text>
            <Text style={[styles.paramValue, isOnline ? styles.paramValueOnline : styles.paramValueOffline]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>

          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Offline Duration</Text>
            <Text style={styles.paramValue}>{formatDuration(offlineDuration)}</Text>
          </View>

          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Last Cloud Sync</Text>
            <Text style={styles.paramValue}>
              {lastSyncTime ? formatRelativeTime(lastSyncTime) : 'Never'}
            </Text>
          </View>

          <View style={styles.paramSwitchRow}>
            <View style={styles.switchTextContainer}>
              <Text style={styles.paramLabel}>Developer Debug Mode</Text>
              <Text style={styles.switchSubtext}>Enables verbose terminal tracing</Text>
            </View>
            <Switch
              value={debugMode || false}
              onValueChange={setDebugMode}
              trackColor={{ false: '#333', true: '#00E5FF' }}
              thumbColor={debugMode ? '#FFFFFF' : '#A0A0A0'}
            />
          </View>
        </View>

        {/* Section 3: SQLite Cache Metrics */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>SQLite Cache Metrics</Text>
          
          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Local Users Enrolled</Text>
            <Text style={styles.paramValue}>{userCount}</Text>
          </View>

          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Biometric Auth Logs</Text>
            <Text style={styles.paramValue}>{logCount}</Text>
          </View>

          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Pending Sync Transactions</Text>
            <Text style={[styles.paramValue, pendingCount > 0 ? styles.paramValuePending : null]}>
              {pendingCount}
            </Text>
          </View>
        </View>

        {/* Section 4: Performance & Navigations */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Biometric Performance & Test</Text>
          <Text style={styles.description}>
            Benchmark vector comparisons, check telemetry graphics, or launch the interactive presentation deck.
          </Text>

          {benchmarkResults && (
            <View style={styles.benchmarkResults}>
              <View style={styles.benchmarkRow}>
                <Text style={styles.benchmarkLabel}>Simulated Users</Text>
                <Text style={styles.benchmarkValue}>{benchmarkResults.totalCandidates}</Text>
              </View>
              <View style={styles.benchmarkRow}>
                <Text style={styles.benchmarkLabel}>Match Latency</Text>
                <Text style={styles.benchmarkValue}>{benchmarkResults.positiveMatchTimeMs} ms</Text>
              </View>
              <View style={styles.benchmarkRow}>
                <Text style={styles.benchmarkLabel}>Mismatch Latency</Text>
                <Text style={styles.benchmarkValue}>{benchmarkResults.negativeMatchTimeMs} ms</Text>
              </View>
              <View style={styles.benchmarkRow}>
                <Text style={styles.benchmarkLabel}>Throughput Speed</Text>
                <Text style={styles.benchmarkValueText}>{benchmarkResults.throughputScore} searches/s</Text>
              </View>
            </View>
          )}

          <Button
            label={isBenchmarking ? 'Running Benchmark...' : 'Run Performance Benchmark'}
            onPress={handleRunBenchmark}
            disabled={isBenchmarking}
            variant="outline"
            style={styles.actionBtn}
          />

          <Button
            label="View Telemetry Dashboard"
            onPress={() => navigation.navigate('MetricsDashboard')}
            variant="outline"
            style={styles.actionBtn}
          />

          <Button
            label="Run Demo Presentation"
            onPress={() => navigation.navigate('DemoMode')}
            variant="outline"
            style={styles.actionBtn}
          />
        </View>

        {/* Section 5: Operation Controls */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Operations</Text>
          
          <Button
            label={isSyncing ? 'Syncing...' : 'Force Manual Sync Now'}
            onPress={handleManualSync}
            disabled={isSyncing}
            variant="outline"
            style={styles.actionBtn}
          />

          <Button
            label={isPurging ? 'Purging Cache...' : 'Clean Synced Logs'}
            onPress={handleRunPurge}
            disabled={isPurging}
            variant="outline"
            style={styles.actionBtn}
          />

          <Button
            label="Switch to Admin Dashboard"
            onPress={handleEnterAdminMode}
            variant="primary"
            style={styles.actionBtn}
          />
        </View>

        {/* Section 6: Danger Zone */}
        <View style={[styles.sectionCard, styles.dangerCard]}>
          <Text style={styles.dangerHeader}>Danger Zone</Text>
          <Text style={styles.dangerDescription}>
            A factory reset clears all local enrolled users, local audit logs, and synchronization queues from the SQLite database. Configured provisioning credentials will be retained.
          </Text>

          <TextInput
            style={styles.dangerInput}
            placeholder='Type "DELETE" to authorize reset'
            placeholderTextColor="#888888"
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
    marginBottom: 24,
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
  sectionCard: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  sectionHeader: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    marginBottom: 16,
    letterSpacing: 1,
  },
  paramRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  paramSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  switchTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  switchSubtext: {
    fontFamily: 'System',
    fontSize: 11,
    color: '#666666',
    marginTop: 2,
  },
  paramLabel: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#A0A0A0',
  },
  paramValue: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    maxWidth: '65%',
  },
  description: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#888888',
    lineHeight: 18,
    marginBottom: 16,
  },
  benchmarkResults: {
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222222',
  },
  benchmarkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#161616',
  },
  benchmarkLabel: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#888888',
  },
  benchmarkValue: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  benchmarkValueText: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#00E5FF',
    fontWeight: '700',
  },
  actionBtn: {
    height: 46,
    marginVertical: 6,
  },
  backBtn: {
    marginTop: 10,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#333333',
  },
  dangerCard: {
    borderColor: 'rgba(255, 59, 59, 0.3)',
    backgroundColor: 'rgba(255, 59, 59, 0.03)',
  },
  dangerHeader: {
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '800',
    color: '#FF3B3B',
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
  paramValueOnline: {
    color: '#00C853',
  },
  paramValueOffline: {
    color: '#FF9100',
  },
  paramValuePending: {
    color: '#FF9100',
  },
});
