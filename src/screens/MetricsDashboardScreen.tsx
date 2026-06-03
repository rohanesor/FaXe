import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { performanceMonitor, PerfSummary } from '../modules/performance/PerformanceMonitor';
import { Toast } from '../components/Toast';

type Props = StackScreenProps<MainStackParamList, 'MetricsDashboard'>;

/**
 * Screen designed specifically for hackathon judges to verify biometric performance metrics.
 * Refreshes live stats every 5 seconds.
 */
export function MetricsDashboardScreen({ navigation }: Props) {
  const [metrics, setMetrics] = useState<PerfSummary>({
    avgEnrollmentTimeMs: 0,
    avgVerificationTimeMs: 0,
    avgInferenceTimeMs: 0,
    livenessPassRate: 100,
    recognitionAccuracy: 100,
    totalSessionEnrollments: 0,
    totalSessionVerifications: 0,
  });

  const loadMetrics = () => {
    const data = performanceMonitor.getSummary();
    setMetrics(data);
  };

  useEffect(() => {
    loadMetrics();

    // Auto-refresh metrics every 5 seconds
    const intervalId = setInterval(() => {
      loadMetrics();
    }, 5000);

    return () => clearInterval(intervalId);
  }, []);

  const handleResetMetrics = () => {
    performanceMonitor.reset();
    loadMetrics();
    Toast.show({
      message: 'Performance metrics have been reset.',
      type: 'info',
    });
  };

  // Color helper functions
  const getVerificationTimeColor = (ms: number) => {
    if (ms === 0) return '#FFFFFF';
    return ms < 1000 ? '#00C853' : '#FFD600'; // Green if < 1s, else yellow
  };

  const getInferenceTimeColor = (ms: number) => {
    if (ms === 0) return '#FFFFFF';
    return ms < 100 ? '#00C853' : '#FFD600'; // Green if < 100ms, else yellow
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header section with manual refresh */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Metrics Panel</Text>
            <Text style={styles.subtitle}>REAL-TIME BIOMETRIC PROFILES</Text>
          </View>
          <Pressable style={styles.refreshBtn} onPress={loadMetrics}>
            <Text style={styles.refreshText}>🔄</Text>
          </Pressable>
        </View>

        {/* Two-column card grid */}
        <View style={styles.grid}>
          {/* Card 1: Verification Latency */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Avg Verification</Text>
            <Text style={[styles.cardValue, { color: getVerificationTimeColor(metrics.avgVerificationTimeMs) }]}>
              {metrics.avgVerificationTimeMs > 0 ? `${metrics.avgVerificationTimeMs} ms` : '—'}
            </Text>
            <Text style={styles.cardSubtext}>Ideal target: &lt; 1,000ms</Text>
          </View>

          {/* Card 2: Inference Latency */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Avg Model Inference</Text>
            <Text style={[styles.cardValue, { color: getInferenceTimeColor(metrics.avgInferenceTimeMs) }]}>
              {metrics.avgInferenceTimeMs > 0 ? `${metrics.avgInferenceTimeMs} ms` : '—'}
            </Text>
            <Text style={styles.cardSubtext}>TFLite runtime: &lt; 100ms</Text>
          </View>
        </View>

        <View style={styles.grid}>
          {/* Card 3: Liveness Pass Rate */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Liveness Pass Rate</Text>
            <Text style={[styles.cardValue, styles.cyanText]}>
              {metrics.livenessPassRate}%
            </Text>
            <Text style={styles.cardSubtext}>Anti-spoof rejection ratio</Text>
          </View>

          {/* Card 4: Recognition Accuracy */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Matching Accuracy</Text>
            <Text style={[styles.cardValue, styles.cyanText]}>
              {metrics.recognitionAccuracy}%
            </Text>
            <Text style={styles.cardSubtext}>Successful match ratio</Text>
          </View>
        </View>

        <View style={styles.grid}>
          {/* Card 5: Total Enrollments */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Enrollments</Text>
            <Text style={styles.cardValue}>{metrics.totalSessionEnrollments}</Text>
            <Text style={styles.cardSubtext}>Registrations this session</Text>
          </View>

          {/* Card 6: Total Verifications */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Verifications</Text>
            <Text style={styles.cardValue}>{metrics.totalSessionVerifications}</Text>
            <Text style={styles.cardSubtext}>Authentications this session</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            label="Reset Session Metrics"
            onPress={handleResetMetrics}
            variant="outline"
            style={styles.resetBtn}
          />
          <Button
            label="Back to Settings"
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
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
  refreshBtn: {
    width: 40,
    height: 40,
    backgroundColor: '#161616',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshText: {
    fontSize: 16,
    color: '#00E5FF',
  },
  grid: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  card: {
    flex: 1,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    justifyContent: 'space-between',
    minHeight: 120,
  },
  cardLabel: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: {
    fontFamily: 'System',
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    marginVertical: 10,
  },
  cardSubtext: {
    fontFamily: 'System',
    fontSize: 11,
    color: '#555555',
  },
  cyanText: {
    color: '#00E5FF',
  },
  actions: {
    marginTop: 20,
  },
  resetBtn: {
    borderColor: '#FF3B3B',
    marginBottom: 12,
    height: 46,
  },
  backBtn: {
    height: 46,
  },
});
