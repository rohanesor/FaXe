import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { useMMKVBoolean } from 'react-native-mmkv';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { storage } from '../store';
import { runRecognitionBenchmark } from '../modules/recognition';

type Props = StackScreenProps<MainStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const [, setIsAdminMode] = useMMKVBoolean('isAdminMode', storage);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkResults, setBenchmarkResults] = useState<{
    totalCandidates: number;
    positiveMatchTimeMs: number;
    negativeMatchTimeMs: number;
    throughputScore: number;
  } | null>(null);

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      Alert.alert('Sync Complete', 'Manual database sync completed successfully!');
    }, 1500);
  };

  const handleEnterAdminMode = () => {
    setIsAdminMode(true);
  };

  const handleRunBenchmark = () => {
    setIsBenchmarking(true);
    // Shift execution slightly off-thread to prevent rendering frame freezes
    setTimeout(() => {
      try {
        const results = runRecognitionBenchmark();
        setBenchmarkResults(results);
        Alert.alert(
          'Benchmark Success',
          `Linear search across 5,000 users complete!\n\nMatch scan: ${results.positiveMatchTimeMs}ms\nMismatch scan: ${results.negativeMatchTimeMs}ms\nThroughput: ${results.throughputScore} scans/sec`
        );
      } catch (err: any) {
        console.error('[SettingsScreen] Benchmark run failed:', err);
        Alert.alert('Benchmark Failed', err.message || 'An unexpected error occurred.');
      } finally {
        setIsBenchmarking(false);
      }
    }, 100);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Device Settings</Text>
          <Text style={styles.subtitle}>HARDWARE CONFIGURATION</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>System Parameters</Text>
          
          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Device ID</Text>
            <Text style={styles.paramValue}>DL-FACE-RN-99</Text>
          </View>

          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Partition Code</Text>
            <Text style={styles.paramValue}>AFR-E-02</Text>
          </View>

          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Max Offline Sync Duration</Text>
            <Text style={styles.paramValue}>30 Days</Text>
          </View>

          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Cache Database Version</Text>
            <Text style={styles.paramValue}>v1.12.0-sqlite</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Biometric Performance</Text>
          <Text style={styles.description}>
            Verify offline match latency and vector search throughput speed against a simulated 5,000-user database in memory.
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
            style={styles.syncBtn}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Sync Controls</Text>
          <Text style={styles.description}>
            Manually pull the latest biometric vector sets from the central registry over an active connection.
          </Text>
          <Button
            label={isSyncing ? 'Syncing...' : 'Force Manual Sync Now'}
            onPress={handleManualSync}
            disabled={isSyncing}
            variant="outline"
            style={styles.syncBtn}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Administration</Text>
          <Text style={styles.description}>
            Enter the secure admin mode to manage enrolled profiles, audit logs, and clear offline data caches.
          </Text>
          <Button
            label="Switch to Admin Mode"
            onPress={handleEnterAdminMode}
            variant="primary"
            style={styles.syncBtn}
          />
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
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
  },
  description: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#666666',
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
  syncBtn: {
    height: 46,
  },
  backBtn: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#333333',
  },
});
