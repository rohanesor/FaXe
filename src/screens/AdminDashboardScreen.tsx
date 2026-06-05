import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { useMMKVBoolean } from 'react-native-mmkv';
import { useIsFocused } from '@react-navigation/native';
import { AuthStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { storage } from '../store';
import { syncQueueRepository, purgeManager, userRepository } from '../modules/database';
import { deviceProvisioner } from '../modules/sync/DeviceProvisioner';
import { syncEngine, SyncReport } from '../modules/sync/SyncEngine';
import { connectivityMonitor } from '../modules/sync/ConnectivityMonitor';
import { formatRelativeTime, formatDuration } from '../utils/formatters';
import { Toast } from '../components/Toast';
import { Logger } from '../utils/logger';
import { SyncQueueItem } from '../types';

type Props = StackScreenProps<AuthStackParamList, 'AdminDashboard'>;

/**
 * Control center dashboard for administrators to monitor synchronization cycles,
 * manage dead letter queues, and run database purge commands.
 */
export function AdminDashboardScreen({ navigation }: Props) {
  const [, setIsAdminMode] = useMMKVBoolean('isAdminMode', storage);
  const isFocused = useIsFocused();

  // Dashboard metrics states
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  const [offlineDuration, setOfflineDuration] = useState(0);
  const [dlqItems, setDlqItems] = useState<SyncQueueItem[]>([]);
  const [enrolledCount, setEnrolledCount] = useState(0);

  // Operation progress states
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const loadStats = async () => {
    try {
      // 1. Pending Queue
      const pCount = await syncQueueRepository.getPendingCount();
      setPendingCount(pCount);

      // 2. Last Sync Details
      const lastSync = syncEngine.getLastSyncTime();
      setLastSyncTime(lastSync);

      const reportStr = storage.getString('last_sync_report');
      if (reportStr) {
        setLastReport(JSON.parse(reportStr));
      }

      // 3. Offline Duration
      const offDur = connectivityMonitor.getOfflineDuration();
      setOfflineDuration(offDur);

      // 4. Dead Letter Queue
      const deadQueue = await syncQueueRepository.getDeadLetterQueue();
      setDlqItems(deadQueue);

      // 5. Total Enrolled Users locally
      const partition = deviceProvisioner.getProvisioningData().partition || 'AFR-E-02';
      const users = await userRepository.getUsersByPartition(partition);
      setEnrolledCount(users.length);
    } catch (err) {
      Logger.error('AdminDashboardScreen', 'Failed to retrieve admin statistics', err);
    }
  };

  useEffect(() => {
    if (isFocused) {
      loadStats();
    }
  }, [isFocused]);

  const handleLogout = () => {
    navigation.navigate('Login');
  };

  const handleSwitchToField = () => {
    setIsAdminMode(false);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const report = await syncEngine.runSync();
      await loadStats();
      
      if (report.error) {
        Toast.show({
          message: `Sync finished with errors: ${report.error}`,
          type: 'error',
        });
      } else {
        Toast.show({
          message: `Sync finished. Pushed ${report.pushedLogs} logs, pulled ${report.pulledUsers} remote templates.`,
          type: 'success',
        });
      }
    } catch (err) {
      Logger.error('AdminDashboardScreen', 'Sync manual trigger failed', err);
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
      const purgedCount = await purgeManager.runPurge();
      await loadStats();
      Toast.show({
        message: `Database purge complete. Cleaned ${purgedCount} synced logs from SQLite.`,
        type: 'success',
      });
    } catch (err) {
      Logger.error('AdminDashboardScreen', 'Database purge failed', err);
      Toast.show({
        message: 'Purge operation failed.',
        type: 'error',
      });
    } finally {
      setIsPurging(false);
    }
  };

  const handleRetryAllDLQ = async () => {
    try {
      await syncQueueRepository.resetAllAttempts();
      await loadStats();
      Toast.show({
        message: 'DLQ retry counters reset. Synchronization resumed.',
        type: 'success',
      });
    } catch (err) {
      Logger.error('AdminDashboardScreen', 'DLQ reset failed', err);
      Toast.show({
        message: 'Failed to reset DLQ items.',
        type: 'error',
      });
    }
  };

  const getStatusText = () => {
    if (isSyncing) return 'SYNCING';
    if (pendingCount > 0) return 'UNSYNCED CHANGES';
    return 'SYNCHRONIZED';
  };

  const getStatusColor = () => {
    if (isSyncing) return '#00E5FF'; // Cyan
    if (pendingCount > 0) return '#FF9100'; // Orange
    return '#00C853'; // Green
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Admin Panel</Text>
            <Text style={styles.subtitle}>OFFLINE CONTROL CENTRE</Text>
          </View>
          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>Logout</Text>
          </Pressable>
        </View>

        {/* Sync Status Header */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>System Synchronization</Text>
          <View style={styles.syncRow}>
            <View>
              <Text style={styles.metricLabel}>Last Sync Time</Text>
              <Text style={styles.metricValue}>
                {lastSyncTime ? formatRelativeTime(lastSyncTime) : 'Never'}
              </Text>
            </View>
            <View style={[styles.statusBadge, { borderColor: getStatusColor(), backgroundColor: `${getStatusColor()}15` }]}>
              <Text style={[styles.statusBadgeText, { color: getStatusColor() }]}>{getStatusText()}</Text>
            </View>
          </View>

          {lastReport && (
            <View style={styles.reportSummary}>
              <Text style={styles.reportHeader}>Last Sync Report Details:</Text>
              <Text style={styles.reportText}>• Pushed Logs: {lastReport.pushedLogs}</Text>
              <Text style={styles.reportText}>• Pushed Enrollments: {lastReport.pushedEnrollments}</Text>
              <Text style={styles.reportText}>• Pulled User Records: {lastReport.pulledUsers}</Text>
              <Text style={styles.reportText}>• Conflict Resolution Warnings: {lastReport.conflicts}</Text>
              <Text style={styles.reportText}>• Total Duration: {lastReport.durationMs}ms</Text>
            </View>
          )}

          <Button
            label={isSyncing ? 'Synchronizing...' : 'Force Cloud Sync Now'}
            onPress={handleSyncNow}
            disabled={isSyncing}
            style={styles.syncNowBtn}
          />
        </View>

        {/* Quick Numbers Metrics Grid */}
        <View style={styles.grid}>
          <View style={[styles.gridItem, styles.mr8]}>
            <Text style={styles.gridLabel}>Enrolled Cache</Text>
            <Text style={styles.gridNumber}>{enrolledCount}</Text>
            <Text style={styles.gridSubtext}>Local database</Text>
          </View>
          <View style={[styles.gridItem, styles.ml8]}>
            <Text style={styles.gridLabel}>Pending Sync</Text>
            <Text style={[styles.gridNumber, pendingCount > 0 ? styles.pendingColor : null]}>
              {pendingCount}
            </Text>
            <Text style={styles.gridSubtext}>Queued modifications</Text>
          </View>
        </View>

        {/* Connectivity Offline Duration status */}
        {!connectivityMonitor.isOnline() && (
          <View style={[styles.sectionCard, styles.offlineCard]}>
            <Text style={styles.offlineHeader}>⚠️ SYSTEM DISCONNECTED</Text>
            <Text style={styles.offlineText}>
              Terminal has been off-grid for:
              <Text style={styles.offlineHighlight}> {formatDuration(offlineDuration)}</Text>
            </Text>
          </View>
        )}

        {/* Dead Letter Queue Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Dead Letter Queue ({dlqItems.length})</Text>
          <Text style={styles.description}>
            Items that failed sync attempts 5 or more times due to non-retryable server failures or prolonged network issues.
          </Text>

          {dlqItems.length > 0 ? (
            <View style={styles.dlqList}>
              {dlqItems.map((item) => (
                <View key={item.id} style={styles.dlqRow}>
                  <Text style={styles.dlqActionText}>{item.action.toUpperCase()}</Text>
                  <Text style={styles.dlqAttemptsText}>Failed: {item.attempts} times</Text>
                </View>
              ))}
              <Button
                label="Retry All Failed Queue Items"
                onPress={handleRetryAllDLQ}
                variant="outline"
                style={styles.retryDLQBtn}
              />
            </View>
          ) : (
            <View style={styles.dlqEmptyCard}>
              <Text style={styles.dlqEmptyText}>Dead letter queue is empty. No failed items.</Text>
            </View>
          )}
        </View>

        {/* Purge commands */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Cache Maintenance</Text>
          <Text style={styles.description}>
            Purge old authentication logs (older than 30 days) and flag inactive users locally to scrub hardware caches.
          </Text>
          <Button
            label={isPurging ? 'Purging database...' : 'Run Cache Purge'}
            onPress={handleRunPurge}
            disabled={isPurging}
            variant="outline"
            style={styles.purgeBtn}
          />
        </View>

        <View style={styles.actionsContainer}>
          <Button
            label="Switch to Field Operator Mode"
            onPress={handleSwitchToField}
            style={styles.actionBtn}
          />
        </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    backgroundColor: '#161616',
  },
  logoutBtnText: {
    color: '#FF3B3B',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 1,
  },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  metricLabel: {
    fontFamily: 'System',
    fontSize: 12,
    color: '#888888',
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: 'System',
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  statusBadge: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontFamily: 'System',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  reportSummary: {
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#222222',
    marginBottom: 14,
  },
  reportHeader: {
    color: '#A0A0A0',
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  reportText: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 11,
    marginVertical: 2,
    fontWeight: '600',
  },
  syncNowBtn: {
    height: 44,
  },
  grid: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  gridItem: {
    flex: 1,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 16,
  },
  mr8: {
    marginRight: 8,
  },
  ml8: {
    marginLeft: 8,
  },
  gridLabel: {
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '600',
    color: '#A0A0A0',
    marginBottom: 8,
  },
  gridNumber: {
    fontFamily: 'System',
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  pendingColor: {
    color: '#FF9100',
  },
  gridSubtext: {
    fontFamily: 'System',
    fontSize: 11,
    color: '#555555',
  },
  offlineCard: {
    borderColor: '#FF9100',
    backgroundColor: 'rgba(255,145,0,0.06)',
    paddingVertical: 12,
  },
  offlineHeader: {
    color: '#FF9100',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  offlineText: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: '500',
  },
  offlineHighlight: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  description: {
    color: '#666666',
    fontFamily: 'System',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 14,
  },
  dlqList: {
    marginTop: 6,
  },
  dlqRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0A0A0A',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#222222',
    marginVertical: 4,
  },
  dlqActionText: {
    color: '#FF3B3B',
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
  },
  dlqAttemptsText: {
    color: '#A0A0A0',
    fontFamily: 'System',
    fontSize: 12,
  },
  retryDLQBtn: {
    height: 40,
    borderColor: '#FFB300',
    marginTop: 12,
  },
  dlqEmptyCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222222',
    paddingVertical: 14,
    alignItems: 'center',
  },
  dlqEmptyText: {
    color: '#555555',
    fontSize: 12,
    fontFamily: 'System',
    fontWeight: '600',
  },
  purgeBtn: {
    height: 44,
  },
  actionsContainer: {
    marginTop: 10,
    marginBottom: 20,
  },
  actionBtn: {
    height: 52,
  },
});
