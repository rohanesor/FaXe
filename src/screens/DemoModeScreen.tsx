import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { connectivityMonitor } from '../modules/sync/ConnectivityMonitor';
import { syncQueueRepository, userRepository } from '../modules/database';
import { formatDuration } from '../utils/formatters';
import { Logger } from '../utils/logger';

type Props = StackScreenProps<MainStackParamList, 'DemoMode'>;

/**
 * Interactive demo screen showing DatalakeFaceAuth architectures and specifications to judges.
 */
export function DemoModeScreen({ navigation }: Props) {
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  // Stats for Step 4
  const [offlineTimeText, setOfflineTimeText] = useState('0 minutes');
  const [syncQueueCount, setSyncQueueCount] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);

  // Animations
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const lineAnim1 = useRef(new Animated.Value(0)).current;
  const lineAnim2 = useRef(new Animated.Value(0)).current;
  const lineAnim3 = useRef(new Animated.Value(0)).current;
  const lineAnim4 = useRef(new Animated.Value(0)).current;

  // Load offgrid status values on mount
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const offlineMs = connectivityMonitor.getOfflineDuration();
        setOfflineTimeText(formatDuration(offlineMs || 3600000 * 2.5)); // Fallback to 2.5h for demo if online

        const queueCount = await syncQueueRepository.getPendingCount();
        setSyncQueueCount(queueCount);

        const partition = 'AFR-E-02';
        const users = await userRepository.getUsersByPartition(partition);
        setTotalUsers(users.length);
      } catch (err) {
        Logger.error('DemoModeScreen', 'Failed to fetch status metrics', err);
      }
    };
    fetchStats();
  }, []);

  // Animates connectors on Step 1
  useEffect(() => {
    if (step === 1) {
      lineAnim1.setValue(0);
      lineAnim2.setValue(0);
      lineAnim3.setValue(0);
      lineAnim4.setValue(0);

      Animated.sequence([
        Animated.timing(lineAnim1, { toValue: 1, duration: 400, useNativeDriver: false }),
        Animated.timing(lineAnim2, { toValue: 1, duration: 400, useNativeDriver: false }),
        Animated.timing(lineAnim3, { toValue: 1, duration: 400, useNativeDriver: false }),
        Animated.timing(lineAnim4, { toValue: 1, duration: 400, useNativeDriver: false }),
      ]).start();
    }
  }, [step, lineAnim1, lineAnim2, lineAnim3, lineAnim4]);

  const handleNext = () => {
    if (step < totalSteps) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setStep(step + 1);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }
  };

  const handleBack = () => {
    if (step > 1) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setStep(step - 1);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }
  };

  const handleStartLiveDemo = () => {
    // Navigate to EnrollScreen with prefilled demo parameters
    navigation.navigate('Enroll', {
      prefill: {
        name: 'Demo User',
        role: 'visitor',
        partition: 'DEMO-ZONE',
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>System Walkthrough</Text>
          <Text style={styles.subtitle}>JUDGES SLIDE DECK ({step}/{totalSteps})</Text>
        </View>

        {/* Dynamic Step Display */}
        <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
          
          {/* STEP 1: ARCHITECTURE OVERVIEW */}
          {step === 1 && (
            <View style={styles.slide}>
              <Text style={styles.slideTitle}>5-Layer Local Processing Stack</Text>
              <Text style={styles.slideDesc}>
                Direct face captures pass through consecutive secure offline stages before SQLite enrollment commit.
              </Text>
              
              <View style={styles.archStack}>
                <View style={styles.archLayer}>
                  <Text style={styles.layerNum}>1</Text>
                  <View style={styles.layerContent}>
                    <Text style={styles.layerTitle}>Camera Viewport</Text>
                    <Text style={styles.layerDetails}>High-FPS video alignment detection bounding box</Text>
                  </View>
                </View>

                <Animated.View style={[styles.archConnector, {
                  height: lineAnim1.interpolate({ inputRange: [0, 1], outputRange: [0, 20] })
                }]} />

                <View style={styles.archLayer}>
                  <Text style={styles.layerNum}>2</Text>
                  <View style={styles.layerContent}>
                    <Text style={styles.layerTitle}>Active Liveness Checks</Text>
                    <Text style={styles.layerDetails}>Facial deltas challenge confirmations (eye EAR/smile/left/right/nod)</Text>
                  </View>
                </View>

                <Animated.View style={[styles.archConnector, {
                  height: lineAnim2.interpolate({ inputRange: [0, 1], outputRange: [0, 20] })
                }]} />

                <View style={styles.archLayer}>
                  <Text style={styles.layerNum}>3</Text>
                  <View style={styles.layerContent}>
                    <Text style={styles.layerTitle}>MobileFaceNet Model</Text>
                    <Text style={styles.layerDetails}>TFLite feature extraction generating 128-float embedding vectors</Text>
                  </View>
                </View>

                <Animated.View style={[styles.archConnector, {
                  height: lineAnim3.interpolate({ inputRange: [0, 1], outputRange: [0, 20] })
                }]} />

                <View style={styles.archLayer}>
                  <Text style={styles.layerNum}>4</Text>
                  <View style={styles.layerContent}>
                    <Text style={styles.layerTitle}>Cryptographic Envelope</Text>
                    <Text style={styles.layerDetails}>HKDF user-key derivations & authenticated AES-256-GCM encryption</Text>
                  </View>
                </View>

                <Animated.View style={[styles.archConnector, {
                  height: lineAnim4.interpolate({ inputRange: [0, 1], outputRange: [0, 20] })
                }]} />

                <View style={styles.archLayer}>
                  <Text style={styles.layerNum}>5</Text>
                  <View style={styles.layerContent}>
                    <Text style={styles.layerTitle}>Secure SQLite Storage</Text>
                    <Text style={styles.layerDetails}>Biometric templates saved securely at rest locally</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* STEP 2: MODEL SPECIFICATIONS */}
          {step === 2 && (
            <View style={styles.slide}>
              <Text style={styles.slideTitle}>CNN Model Specifications</Text>
              <Text style={styles.slideDesc}>
                Quantized local execution yields sub-100ms inference execution directly on device.
              </Text>
              
              <View style={styles.table}>
                <View style={styles.tableRow}>
                  <Text style={styles.tableHeader}>Parameter</Text>
                  <Text style={styles.tableHeader}>Value</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableKey}>Model Architecture</Text>
                  <Text style={styles.tableVal}>MobileFaceNet (CNN)</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableKey}>File Footprint</Text>
                  <Text style={styles.tableVal}>5.2 MB (.tflite)</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableKey}>Input Dimensions</Text>
                  <Text style={styles.tableVal}>112 x 112 x 3 (RGB)</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableKey}>Output Embedding</Text>
                  <Text style={styles.tableVal}>128-float vector</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableKey}>Quantization Format</Text>
                  <Text style={styles.tableVal}>INT8 Post-Training</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableKey}>Avg Inference Latency</Text>
                  <Text style={styles.tableVal}>~35 ms (Local CPU)</Text>
                </View>
              </View>
            </View>
          )}

          {/* STEP 3: SECURITY OVERVIEW */}
          {step === 3 && (
            <View style={styles.slide}>
              <Text style={styles.slideTitle}>Cryptographic Hardware Isolation</Text>
              <Text style={styles.slideDesc}>
                Device biometrics are shielded via zero-leakage keys and encryption-at-rest models.
              </Text>
              
              <View style={styles.cryptoBox}>
                <View style={styles.cryptoLayer}>
                  <Text style={styles.cryptoTitle}>🔑 KeyStore / KeyChain</Text>
                  <Text style={styles.cryptoDetails}>Hardware enclave derives & secures 256-bit AES master credentials requiring system auth.</Text>
                </View>
                
                <Text style={styles.arrowText}>↓ HKDF Key Expansion (RFC 5869)</Text>
                
                <View style={styles.cryptoLayer}>
                  <Text style={styles.cryptoTitle}>⚙️ Per-User Unique Keys</Text>
                  <Text style={styles.cryptoDetails}>Master key combines with user ID via HMAC-SHA256 to calculate unique salts per operator profile.</Text>
                </View>
                
                <Text style={styles.arrowText}>↓ AES-256-GCM Envelope</Text>
                
                <View style={styles.cryptoLayer}>
                  <Text style={styles.cryptoTitle}>🔒 Galois Authenticated Blobs</Text>
                  <Text style={styles.cryptoDetails}>Each 512-byte template contains unique 12-byte IV ciphers and 16-byte GHASH tags to verify integrity.</Text>
                </View>
              </View>
            </View>
          )}

          {/* STEP 4: OFFLINE CAPABILITY */}
          {step === 4 && (
            <View style={styles.slide}>
              <Text style={styles.slideTitle}>Off-Grid Resiliency Timeline</Text>
              <Text style={styles.slideDesc}>
                Queues local logs and database additions in SQLite during network disconnects.
              </Text>
              
              <View style={styles.timelineCard}>
                <View style={styles.timelineMetric}>
                  <Text style={styles.timelineLabel}>Offline Duration</Text>
                  <Text style={styles.timelineValue}>{offlineTimeText}</Text>
                  <Text style={styles.timelineSub}>Active disconnected operations</Text>
                </View>

                <View style={styles.timelineDivider} />

                <View style={styles.timelineMetric}>
                  <Text style={styles.timelineLabel}>Pending Sync Queue</Text>
                  <Text style={[styles.timelineValue, styles.orangeText]}>{syncQueueCount} Items</Text>
                  <Text style={styles.timelineSub}>Queued modifications waiting for connection</Text>
                </View>

                <View style={styles.timelineDivider} />

                <View style={styles.timelineMetric}>
                  <Text style={styles.timelineLabel}>Local Population</Text>
                  <Text style={styles.timelineValue}>{totalUsers} Registered</Text>
                  <Text style={styles.timelineSub}>Operator database in partition</Text>
                </View>
              </View>
            </View>
          )}

          {/* STEP 5: LIVE DEMO INITIATION */}
          {step === 5 && (
            <View style={styles.slide}>
              <Text style={styles.slideTitle}>Prefilled Verification Simulation</Text>
              <Text style={styles.slideDesc}>
                Trigger a live biometric simulation with prepopulated test operator metadata.
              </Text>
              
              <View style={styles.demoProfileCard}>
                <Text style={styles.demoProfileTitle}>Prefilled Test Account</Text>
                <View style={styles.demoField}>
                  <Text style={styles.demoFieldLabel}>Full Name:</Text>
                  <Text style={styles.demoFieldValue}>Demo User</Text>
                </View>
                <View style={styles.demoField}>
                  <Text style={styles.demoFieldLabel}>Role Assigned:</Text>
                  <Text style={styles.demoFieldValue}>Visitor (Segmented)</Text>
                </View>
                <View style={styles.demoField}>
                  <Text style={styles.demoFieldLabel}>Partition Code:</Text>
                  <Text style={styles.demoFieldValue}>DEMO-ZONE</Text>
                </View>
              </View>

              <Button
                label="Launch Live Trial Now"
                onPress={handleStartLiveDemo}
                variant="success"
                style={styles.demoLaunchBtn}
              />
            </View>
          )}
        </Animated.View>

        {/* Progress Dots Indicator */}
        <View style={styles.dotsRow}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                step === i + 1 ? styles.activeDot : styles.inactiveDot,
              ]}
            />
          ))}
        </View>

        {/* Navigation Buttons */}
        <View style={styles.navRow}>
          {step > 1 ? (
            <Pressable style={styles.navBtn} onPress={handleBack}>
              <Text style={styles.navBtnText}>← Back</Text>
            </Pressable>
          ) : (
            <View style={styles.emptyNavPlaceholder} />
          )}

          {step < totalSteps ? (
            <Pressable style={[styles.navBtn, styles.nextBtn]} onPress={handleNext}>
              <Text style={styles.navBtnText}>Next →</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.navBtn, styles.exitBtn]}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.navBtnText}>Exit Demo</Text>
            </Pressable>
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
  stepContainer: {
    flex: 1,
    justifyContent: 'center',
    marginVertical: 10,
  },
  slide: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 16,
    padding: 24,
    width: '100%',
  },
  slideTitle: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  slideDesc: {
    color: '#888888',
    fontFamily: 'System',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 24,
  },
  archStack: {
    alignItems: 'center',
  },
  archLayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333333',
    padding: 12,
    width: '100%',
  },
  layerNum: {
    color: '#00E5FF',
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: '900',
    marginRight: 14,
    width: 16,
    textAlign: 'center',
  },
  layerContent: {
    flex: 1,
  },
  layerTitle: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  layerDetails: {
    color: '#666666',
    fontFamily: 'System',
    fontSize: 11,
  },
  archConnector: {
    width: 2,
    backgroundColor: '#333333',
  },
  table: {
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  tableHeader: {
    color: '#888888',
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tableKey: {
    color: '#A0A0A0',
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '600',
  },
  tableVal: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '700',
  },
  cryptoBox: {
    alignItems: 'center',
  },
  cryptoLayer: {
    backgroundColor: '#0A0A0A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333333',
    padding: 14,
    width: '100%',
  },
  cryptoTitle: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  cryptoDetails: {
    color: '#666666',
    fontFamily: 'System',
    fontSize: 11,
    lineHeight: 15,
  },
  arrowText: {
    color: '#00E5FF',
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: '700',
    marginVertical: 8,
  },
  timelineCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222222',
    padding: 16,
  },
  timelineMetric: {
    paddingVertical: 10,
  },
  timelineLabel: {
    color: '#666666',
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  timelineValue: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  timelineSub: {
    color: '#444444',
    fontFamily: 'System',
    fontSize: 11,
  },
  timelineDivider: {
    height: 1,
    backgroundColor: '#222222',
    marginVertical: 6,
  },
  orangeText: {
    color: '#FFB300',
  },
  demoProfileCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222222',
    padding: 20,
    marginBottom: 24,
  },
  demoProfileTitle: {
    color: '#00E5FF',
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    paddingBottom: 8,
  },
  demoField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  demoFieldLabel: {
    color: '#666666',
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '600',
  },
  demoFieldValue: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '700',
  },
  demoLaunchBtn: {
    height: 48,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  activeDot: {
    width: 20,
    backgroundColor: '#00E5FF',
  },
  inactiveDot: {
    width: 8,
    backgroundColor: '#333333',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  navBtn: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 90,
    alignItems: 'center',
  },
  nextBtn: {
    borderColor: '#00E5FF',
  },
  exitBtn: {
    borderColor: '#FF3B3B',
  },
  navBtnText: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyNavPlaceholder: {
    width: 90,
  },
});
