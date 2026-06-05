import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { useIsFocused } from '@react-navigation/native';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { storage } from '../store';
import { deviceProvisioner } from '../modules/sync/DeviceProvisioner';
import { userRepository, syncQueueRepository, authLogRepository } from '../modules/database';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { AuthLog } from '../types';

type Props = StackScreenProps<MainStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const isFocused = useIsFocused();
  const [isLoading, setIsLoading] = useState(true);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [partition, setPartition] = useState('AFR-E-02');
  const [lastAttempt, setLastAttempt] = useState<AuthLog | null>(null);
  const [todayStats, setTodayStats] = useState<{ success: number; failure: number }>({ success: 0, failure: 0 });

  useEffect(() => {
    if (isFocused) {
      const loadStats = async () => {
        setIsLoading(true);
        try {
          const cachedPartition = deviceProvisioner.getProvisioningData().partition || 'AFR-E-02';
          setPartition(cachedPartition);

          // Retrieve dynamic enrolled count for this partition
          const users = await userRepository.getUsersByPartition(cachedPartition);
          setEnrolledCount(users.length);

          // Retrieve dynamic pending items count in the sync queue
          const pendingCount = await syncQueueRepository.getPendingCount();
          setPendingSyncCount(pendingCount);

          // Retrieve last verification attempt
          const lastVerification = await authLogRepository.getLastAttempt();
          setLastAttempt(lastVerification);

          // Retrieve today's verification counts
          const stats = await authLogRepository.getTodayStats();
          setTodayStats(stats);
        } catch (err) {
          console.error('[HomeScreen] Failed to load offline stats:', err);
        } finally {
          setIsLoading(false);
        }
      };
      loadStats();
    }
  }, [isFocused]);

  const formatLastAttemptTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  const getResultColor = (result: string) => {
    if (result === 'success') return styles.resultSuccess;
    if (result === 'spoof') return styles.resultSpoof;
    return styles.resultFailure;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Field Operations</Text>
            <Text style={styles.subtitle}>OFFLINE IDENTITY VERIFICATION</Text>
          </View>
          
          <View style={styles.headerRight}>
            <Pressable
              style={styles.syncBtnContainer}
              onPress={() => navigation.navigate('Settings')}
            >
              <Text style={styles.syncIcon}>🔄</Text>
              {pendingSyncCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {pendingSyncCount > 99 ? '99+' : pendingSyncCount}
                  </Text>
                </View>
              )}
            </Pressable>

            <Pressable
              style={styles.settingsCog}
              onPress={() => navigation.navigate('Settings')}
            >
              <Text style={styles.cogText}>⚙</Text>
            </Pressable>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.heroCardSkeleton}>
            <SkeletonLoader width="100%" height={90} borderRadius={16} />
          </View>
        ) : (
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Offline Status: Operational</Text>
            <Text style={styles.heroText}>
              Local face embeddings cache is up to date. Direct biometrics enrolment and recognition can be executed securely off-grid.
            </Text>
          </View>
        )}

        <View style={styles.actionsContainer}>
          <Text style={styles.sectionTitle}>Verification Actions</Text>
          
          <Button
            label="Enroll New User"
            onPress={() => navigation.navigate('Enroll')}
            style={styles.actionBtn}
          />
          
          {isLoading ? (
            <View style={styles.skeletonTextContainer}>
              <SkeletonLoader width={180} height={14} borderRadius={4} />
            </View>
          ) : (
            <Text style={styles.enrolledUserText}>
              {enrolledCount} enrolled user{enrolledCount !== 1 ? 's' : ''} in local partition
            </Text>
          )}

          <Button
            label="Verify Identity"
            onPress={() => navigation.navigate('Verify')}
            variant="outline"
            style={styles.actionBtn}
          />

          {/* Last verification row */}
          {isLoading ? (
            <View style={styles.skeletonContainerRow}>
              <SkeletonLoader width="100%" height={56} borderRadius={12} />
            </View>
          ) : (
            lastAttempt && (
              <View style={styles.lastAttemptContainer}>
                <Text style={styles.lastAttemptLabel}>Last Verification Result</Text>
                <View style={styles.lastAttemptRow}>
                  <Text style={[styles.lastAttemptResult, getResultColor(lastAttempt.result)]}>
                    {lastAttempt.result === 'success' ? 'VERIFIED' :
                     lastAttempt.result === 'spoof' ? 'SPOOF_DETECTED' : 'NOT_RECOGNIZED'}
                  </Text>
                  <Text style={styles.lastAttemptTime}>
                    at {formatLastAttemptTime(lastAttempt.timestamp)}
                  </Text>
                </View>
              </View>
            )
          )}

          {/* Today's statistics row */}
          {isLoading ? (
            <View style={styles.skeletonStatsRow}>
              <SkeletonLoader width={220} height={16} borderRadius={4} />
            </View>
          ) : (
            <View style={styles.todayStatsContainer}>
              <Text style={styles.todayStatsText}>
                Today's Scans: <Text style={styles.resultSuccess}>{todayStats.success} passed</Text> • <Text style={styles.resultFailure}>{todayStats.failure} failed</Text>
              </Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Secure offline database: {partition}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
  syncBtnContainer: {
    width: 40,
    height: 40,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    position: 'relative',
  },
  syncIcon: {
    fontSize: 16,
    color: '#00E5FF',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B3B',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#0A0A0A',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
  settingsCog: {
    width: 40,
    height: 40,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cogText: {
    color: '#00E5FF',
    fontSize: 18,
    fontWeight: '700',
  },
  heroCard: {
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
    borderRadius: 16,
    padding: 20,
    marginVertical: 20,
  },
  heroCardSkeleton: {
    marginVertical: 20,
  },
  heroTitle: {
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '700',
    color: '#00E5FF',
    marginBottom: 8,
  },
  heroText: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#A0A0A0',
    lineHeight: 20,
  },
  actionsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    marginBottom: 16,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  actionBtn: {
    marginVertical: 6,
    height: 56,
  },
  enrolledUserText: {
    fontFamily: 'System',
    fontSize: 12,
    color: '#00E5FF',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  skeletonTextContainer: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  skeletonContainerRow: {
    marginTop: 14,
  },
  skeletonStatsRow: {
    marginTop: 16,
    alignItems: 'center',
  },
  lastAttemptContainer: {
    backgroundColor: '#111111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222222',
    padding: 12,
    marginTop: 14,
    alignItems: 'center',
  },
  lastAttemptLabel: {
    fontFamily: 'System',
    color: '#666666',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  lastAttemptRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastAttemptResult: {
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '700',
    marginRight: 6,
  },
  lastAttemptTime: {
    fontFamily: 'System',
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: '500',
  },
  todayStatsContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  todayStatsText: {
    fontFamily: 'System',
    color: '#666666',
    fontSize: 12,
    fontWeight: '600',
  },
  resultSuccess: {
    color: '#00C853',
    fontWeight: '700',
  },
  resultFailure: {
    color: '#FF3B3B',
    fontWeight: '700',
  },
  resultSpoof: {
    color: '#FF9100',
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontFamily: 'System',
    fontSize: 12,
    color: '#666666',
  },
});
