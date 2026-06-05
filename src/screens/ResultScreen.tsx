import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { OutcomeBadge } from '../components/OutcomeBadge';
import { ConfidenceBar } from '../components/ConfidenceBar';
import { storage } from '../store';
import { deviceProvisioner } from '../modules/sync/DeviceProvisioner';

type Props = StackScreenProps<MainStackParamList, 'Result'>;

/**
 * Renders a shareable summary audit card for a biometric verification event.
 * Ideal for administrators reviewing offline authorization logs.
 */
export function ResultScreen({ route, navigation }: Props) {
  const { result } = route.params;
  const partition = deviceProvisioner.getProvisioningData().partition || 'AFR-E-02';
  const deviceId = 'DL-FACE-RN-99';

  // Format date helper: "Jun 3, 2026 — 14:32:05"
  const formatTimestamp = (isoString?: string | null): string => {
    const date = isoString ? new Date(isoString) : new Date();
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    
    const pad = (num: number) => num.toString().padStart(2, '0');
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    
    return `${month} ${day}, ${year} — ${hours}:${minutes}:${seconds}`;
  };

  const timestampString = formatTimestamp(result.timestamp);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Audit Log Details</Text>
          <Text style={styles.subtitle}>SECURE TRANSACTION RECORD</Text>
        </View>

        {/* Shareable Summary Audit Card */}
        <View style={styles.auditCard}>
          <View style={styles.badgeSection}>
            <OutcomeBadge outcome={result.outcome} />
          </View>

          {/* User Profile Info (if VERIFIED) */}
          {result.userName ? (
            <View style={styles.userSection}>
              <Text style={styles.userName}>{result.userName}</Text>
              <Text style={styles.userRole}>Role: {result.role || 'Operator'}</Text>
              {result.userId && <Text style={styles.userIdText}>ID: {result.userId}</Text>}
            </View>
          ) : (
            <View style={styles.userSection}>
              <Text style={styles.userName}>Unidentified Identity</Text>
              <Text style={styles.userRole}>Biometric verification did not resolve</Text>
            </View>
          )}

          {/* Timestamp Indicator */}
          <View style={styles.timestampRow}>
            <Text style={styles.timestampLabel}>TIMESTAMP</Text>
            <Text style={styles.timestampValue}>{timestampString}</Text>
          </View>

          <View style={styles.separator} />

          {/* Scores Progress Bars Section */}
          <View style={styles.metricsSection}>
            <Text style={styles.sectionHeader}>Biometric Metrics</Text>
            
            {result.confidence !== null && (
              <ConfidenceBar
                value={result.confidence}
                label="Facial Match Confidence"
              />
            )}
            
            {result.livenessScore !== null && (
              <ConfidenceBar
                value={result.livenessScore}
                label="Liveness Verification Score"
              />
            )}

            <View style={styles.pipelineRow}>
              <Text style={styles.pipelineLabel}>Processing Latency</Text>
              <Text style={styles.pipelineValue}>{result.pipelineTimeMs} ms</Text>
            </View>
          </View>

          <View style={styles.separator} />

          {/* Device & Partition details at bottom */}
          <View style={styles.cardFooter}>
            <Text style={styles.footerDetailsText}>Device: {deviceId}</Text>
            <Text style={styles.footerDetailsText}>Partition: {partition}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            label="Back to Home"
            onPress={() => navigation.navigate('Home')}
            style={styles.homeBtn}
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
    justifyContent: 'space-between',
  },
  header: {
    marginBottom: 20,
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
  auditCard: {
    backgroundColor: '#111111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222222',
    padding: 24,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  badgeSection: {
    marginBottom: 20,
    alignItems: 'center',
  },
  userSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  userName: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  userRole: {
    color: '#00E5FF',
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  userIdText: {
    color: '#666666',
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 6,
  },
  timestampRow: {
    backgroundColor: '#161616',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  timestampLabel: {
    color: '#666666',
    fontFamily: 'System',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  timestampValue: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: '#222222',
    marginVertical: 16,
  },
  metricsSection: {
    width: '100%',
  },
  sectionHeader: {
    color: '#A0A0A0',
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  pipelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  pipelineLabel: {
    color: '#666666',
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
  },
  pipelineValue: {
    color: '#00E5FF',
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  footerDetailsText: {
    color: '#555555',
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    marginTop: 20,
    width: '100%',
  },
  homeBtn: {
    height: 50,
  },
});
