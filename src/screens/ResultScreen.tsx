import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { UserCard } from '../components/UserCard';
import { User } from '../types';

type Props = StackScreenProps<MainStackParamList, 'Result'>;

export function ResultScreen({ route, navigation }: Props) {
  const { result } = route.params;

  const isSpoof = !result.matched && result.livenessScore < 0.5;
  const isMatch = result.matched;

  const mockUser: User = {
    id: result.userId || 'usr-4129',
    name: 'Sarah Connor',
    role: 'Security Officer',
    partition: 'AFR-E-02',
    embeddingBlob: 'mock_blob_123',
    enrolledAt: '2026-01-15T08:30:00Z',
    lastSeen: result.timestamp || new Date().toISOString(),
    syncStatus: 'synced',
  };

  const getStatusTheme = () => {
    if (isMatch) {
      return {
        color: '#00C853',
        title: 'VERIFIED MATCH',
        description: 'Biometric identity has been successfully validated against the local cache.',
        iconBg: 'rgba(0, 200, 83, 0.1)',
      };
    } else if (isSpoof) {
      return {
        color: '#FF3B3B',
        title: 'SPOOF DETECTED',
        description: 'Liveness challenge failed. A bypass attempt (photo/video replay) has been intercepted.',
        iconBg: 'rgba(255, 59, 59, 0.1)',
      };
    } else {
      return {
        color: '#FF3B3B',
        title: 'IDENTITY MISMATCH',
        description: 'The face scan completed successfully, but does not match any profile in the database.',
        iconBg: 'rgba(255, 59, 59, 0.1)',
      };
    }
  };

  const theme = getStatusTheme();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Verification Result</Text>
          <Text style={styles.subtitle}>REAL-TIME VECTOR DECISION</Text>
        </View>

        <View style={[styles.outcomeCard, { borderColor: theme.color }]}>
          <View style={[styles.statusIconContainer, { backgroundColor: theme.iconBg }]}>
            <Text style={[styles.statusIcon, { color: theme.color }]}>
              {isMatch ? '✓' : '⚠'}
            </Text>
          </View>
          <Text style={[styles.outcomeTitle, { color: theme.color }]}>{theme.title}</Text>
          <Text style={styles.outcomeDescription}>{theme.description}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Biometric Metrics</Text>
          
          <View style={styles.metricRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Facial Confidence</Text>
              <Text style={[styles.metricValue, isMatch ? styles.colorSuccess : styles.colorWhite]}>
                {(result.confidence * 100).toFixed(1)}%
              </Text>
              <Text style={styles.metricSubtext}>Thresh: 75.0%</Text>
            </View>

            <View style={styles.dividerCol} />

            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Liveness Score</Text>
              <Text
                style={[
                  styles.metricValue,
                  result.livenessScore >= 0.5 ? styles.colorSuccess : styles.colorDanger,
                ]}
              >
                {(result.livenessScore * 100).toFixed(1)}%
              </Text>
              <Text style={styles.metricSubtext}>Thresh: 50.0%</Text>
            </View>
          </View>
        </View>

        {isMatch && (
          <View style={styles.profileSection}>
            <Text style={styles.sectionTitle}>Matched Profile</Text>
            <UserCard user={mockUser} />
          </View>
        )}

        <View style={styles.actions}>
          <Button
            label="Done"
            onPress={() => navigation.navigate('Home')}
            style={styles.actionBtn}
          />
          {!isMatch && (
            <Button
              label="Try Again"
              onPress={() => navigation.navigate('Verify')}
              variant="outline"
              style={styles.actionBtn}
            />
          )}
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
  outcomeCard: {
    backgroundColor: '#161616',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  statusIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIcon: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  outcomeTitle: {
    fontFamily: 'System',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'center',
  },
  outcomeDescription: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 20,
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
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  dividerCol: {
    width: 1,
    height: 50,
    backgroundColor: '#222222',
  },
  metricLabel: {
    fontFamily: 'System',
    fontSize: 12,
    color: '#A0A0A0',
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: 'System',
    fontSize: 28,
    fontWeight: '900',
  },
  metricSubtext: {
    fontFamily: 'System',
    fontSize: 11,
    color: '#666666',
    marginTop: 2,
  },
  profileSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 1,
  },
  actions: {
    marginTop: 'auto',
  },
  actionBtn: {
    marginVertical: 6,
  },
  colorSuccess: {
    color: '#00C853',
  },
  colorDanger: {
    color: '#FF3B3B',
  },
  colorWhite: {
    color: '#FFFFFF',
  },
});
