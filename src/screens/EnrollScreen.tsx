import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { CameraView } from '../components/CameraView';
import { StepIndicator } from '../components/StepIndicator';
import { RolePicker } from '../components/RolePicker';
import { LivenessChallenge } from '../components/LivenessChallenge';
import { LivenessOrchestrator } from '../modules/liveness/LivenessOrchestrator';
import { runLivenessCheck } from '../modules/liveness';
import { ChallengeType, LivenessResult } from '../types/liveness';
import { Landmark } from '../modules/liveness/LandmarkTracker';
import { AlignedFaceFrame } from '../types/camera';
import { EnrollmentState, EnrollmentResult } from '../types/enrollment';
import { enrollmentManager } from '../modules/enrollment/EnrollmentManager';
import { storage } from '../store';

type Props = StackScreenProps<MainStackParamList, 'Enroll'>;

export function EnrollScreen({ navigation }: Props) {
  // UI states
  const [state, setState] = useState<EnrollmentState>('form');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'worker' | 'admin' | 'visitor'>('worker');
  const [partition, setPartition] = useState('AFR-E-02');
  const [alignedFrame, setAlignedFrame] = useState<AlignedFaceFrame | null>(null);

  // Active Liveness States
  const [activeLivenessActive, setActiveLivenessActive] = useState(false);
  const [currentChallenge, setCurrentChallenge] = useState<ChallengeType | null>(null);
  const [challengeStatus, setChallengeStatus] = useState<'active' | 'passed' | 'failed'>('active');
  const [progressText, setProgressText] = useState('');
  const [livenessError, setLivenessError] = useState<string | null>(null);

  // Enrollment process state
  const [enrollmentResult, setEnrollmentResult] = useState<EnrollmentResult | null>(null);

  // Scale animation for success checkmark or error X
  const badgeScale = useRef(new Animated.Value(0)).current;

  // Load partition code from MMKV on mount
  useEffect(() => {
    const cachedPartition = storage.getString('partition');
    if (cachedPartition) {
      setPartition(cachedPartition);
    }
  }, []);

  // Trigger scale animation on success/error screens
  useEffect(() => {
    if (state === 'success' || state === 'error') {
      badgeScale.setValue(0);
      Animated.spring(badgeScale, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
  }, [state, badgeScale]);

  // Generates coordinate feeds that mimic human alignment gestures over time (same as VerifyScreen)
  const getSimulatedLandmarksForChallenge = (challenge: ChallengeType, tick: number): Landmark[] => {
    const baseLandmarks: Landmark[] = [
      { x: 100, y: 100 }, // Left Eye center
      { x: 200, y: 100 }, // Right Eye center
      { x: 150, y: 150 }, // Nose Tip
      { x: 110, y: 200 }, // Mouth Left
      { x: 190, y: 200 }, // Mouth Right
      { x: 150, y: 240 }, // Chin
      { x: 0, y: 0.35 },  // Left Eye EAR
      { x: 0, y: 0.35 },  // Right Eye EAR
    ];

    switch (challenge) {
      case ChallengeType.BLINK:
        if (tick >= 6 && tick <= 8) {
          baseLandmarks[6].y = 0.05;
          baseLandmarks[7].y = 0.05;
        }
        break;
      case ChallengeType.SMILE:
        if (tick >= 6) {
          baseLandmarks[3].x = 90;
          baseLandmarks[4].x = 210;
        }
        break;
      case ChallengeType.TURN_LEFT:
        if (tick >= 6) {
          baseLandmarks[2].x = 95;
        }
        break;
      case ChallengeType.TURN_RIGHT:
        if (tick >= 6) {
          baseLandmarks[2].x = 205;
        }
        break;
      case ChallengeType.NOD:
        if (tick >= 6 && tick <= 8) {
          baseLandmarks[2].y = 185;
        } else if (tick >= 9) {
          baseLandmarks[2].y = 152;
        }
        break;
    }

    return baseLandmarks;
  };

  const handleFaceAligned = async (frameData: AlignedFaceFrame) => {
    console.log('[EnrollScreen] Face aligned. Freezing frame and initiating liveness checks...');
    setAlignedFrame(frameData);
    setLivenessError(null);
    setState('liveness');

    // Promisified loop that simulates active challenges
    const runActiveChecks = () => {
      return new Promise<LivenessResult>((resolve) => {
        const orchestrator = new LivenessOrchestrator();
        orchestrator.startSession();
        
        setActiveLivenessActive(true);
        setCurrentChallenge(orchestrator.getCurrentChallenge());
        setChallengeStatus('active');
        setProgressText(orchestrator.getProgressText());

        let simTick = 0;
        let landmarksTimer: any;

        const feedLoop = () => {
          const curChallenge = orchestrator.getCurrentChallenge();
          if (!curChallenge) {
            clearInterval(landmarksTimer);
            return;
          }

          simTick++;
          const mockLandmarks = getSimulatedLandmarksForChallenge(curChallenge, simTick);
          const feed = orchestrator.feedLandmarks(mockLandmarks);

          if (feed.passed) {
            setChallengeStatus('passed');
            clearInterval(landmarksTimer);
            
            setTimeout(() => {
              if (feed.completed) {
                setActiveLivenessActive(false);
                resolve(feed.result!);
              } else {
                setCurrentChallenge(orchestrator.getCurrentChallenge());
                setChallengeStatus('active');
                setProgressText(orchestrator.getProgressText());
                simTick = 0;
                landmarksTimer = setInterval(feedLoop, 200);
              }
            }, 1000);
          } else if (feed.completed) {
            clearInterval(landmarksTimer);
            setChallengeStatus('failed');
            
            setTimeout(() => {
              setActiveLivenessActive(false);
              resolve(feed.result!);
            }, 1000);
          }
        };

        landmarksTimer = setInterval(feedLoop, 200);
      });
    };

    try {
      // Execute the liveness pipeline
      const livenessResult = await runLivenessCheck(() => frameData, runActiveChecks);

      if (livenessResult.passed) {
        console.log('[EnrollScreen] Liveness passed! Proceeding to enrollment submission...');
        setState('processing');
        executeEnrollment(frameData);
      } else {
        console.log('[EnrollScreen] Liveness failed:', livenessResult.reason);
        setLivenessError('Liveness verification failed. Please align again.');
        setState('camera');
        setAlignedFrame(null);
      }
    } catch (err) {
      console.error('[EnrollScreen] Liveness runner exception:', err);
      setLivenessError('A system error occurred during liveness.');
      setState('camera');
      setAlignedFrame(null);
    }
  };

  const executeEnrollment = async (frame: AlignedFaceFrame) => {
    try {
      const result = await enrollmentManager.enrollUser(
        {
          name,
          role,
          partition,
        },
        frame
      );

      setEnrollmentResult(result);
      if (result.success) {
        setState('success');
      } else {
        setState('error');
      }
    } catch (err) {
      console.error('[EnrollScreen] Enrollment pipeline crashed:', err);
      setEnrollmentResult({
        success: false,
        userId: null,
        name: null,
        enrolledAt: null,
        reason: 'SYSTEM_ERROR',
        step: 5,
      });
      setState('error');
    }
  };

  const getStepIndex = (): number => {
    switch (state) {
      case 'form':
        return 0;
      case 'camera':
      case 'liveness':
        return 1;
      case 'processing':
      case 'success':
      case 'error':
        return 2;
      default:
        return 0;
    }
  };

  const handleCancelCamera = () => {
    setState('form');
    setAlignedFrame(null);
  };

  const resetFlow = () => {
    setName('');
    setRole('worker');
    setAlignedFrame(null);
    setEnrollmentResult(null);
    setState('form');
  };

  const retryFromState = () => {
    if (!enrollmentResult) {
      setState('form');
      return;
    }
    
    // Redirect to form or camera depending on the error type
    if (enrollmentResult.reason === 'INVALID_INPUT') {
      setState('form');
    } else {
      setAlignedFrame(null);
      setState('camera');
    }
  };

  const getErrorMessage = (): string => {
    if (!enrollmentResult) return 'Enrollment failed. Please try again';
    switch (enrollmentResult.reason) {
      case 'DUPLICATE_FACE':
        return 'This face is already enrolled in this partition';
      case 'INVALID_INPUT':
        return 'Please check the form and try again';
      case 'INFERENCE_FAILED':
        return 'Face scan failed. Please try again in better lighting';
      default:
        return 'Enrollment failed. Please try again';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {/* Renders Step Dots at top */}
        <StepIndicator currentStep={getStepIndex()} />

        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          
          {/* STATE: FORM */}
          {state === 'form' && (
            <View style={styles.stepContainer}>
              <View style={styles.header}>
                <Text style={styles.title}>Operator Details</Text>
                <Text style={styles.subtitle}>CREATE SECURE OFFLINE PROFILE</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardHeader}>Identity Attributes</Text>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Full Name</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter operator name"
                    placeholderTextColor="#666666"
                    maxLength={60}
                  />
                  <Text style={styles.charCount}>{name.length}/60 chars</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Assigned Role</Text>
                  <RolePicker value={role} onChange={setRole} />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Local Device Partition</Text>
                  <View style={styles.readonlyPartition}>
                    <Text style={styles.readonlyPartitionText}>{partition}</Text>
                  </View>
                  <Text style={styles.helperText}>Locked to offline hardware cache settings.</Text>
                </View>
              </View>

              <Button
                label="Continue to Camera"
                onPress={() => setState('camera')}
                disabled={!name.trim()}
                style={styles.actionBtn}
              />
              <Button
                label="Cancel"
                onPress={() => navigation.goBack()}
                variant="outline"
                style={styles.actionBtn}
              />
            </View>
          )}

          {/* STATE: CAMERA */}
          {state === 'camera' && (
            <View style={styles.stepContainer}>
              <View style={styles.cameraHeaderRow}>
                <Pressable onPress={handleCancelCamera} style={styles.cancelLink}>
                  <Text style={styles.cancelLinkText}>✕ Cancel</Text>
                </Pressable>
                <Text style={styles.cameraTitle}>Biometric Scan</Text>
              </View>

              <Text style={styles.cameraInstruction}>Position your face inside the center oval</Text>
              
              {livenessError && (
                <Text style={styles.livenessWarning}>{livenessError}</Text>
              )}

              <View style={styles.cameraContainer}>
                <CameraView onFaceAligned={handleFaceAligned} isActive={state === 'camera'} />
              </View>
            </View>
          )}

          {/* STATE: LIVENESS */}
          {state === 'liveness' && alignedFrame && (
            <View style={styles.stepContainer}>
              <Text style={styles.cameraInstruction}>Liveness Verification</Text>
              
              <View style={styles.cameraContainer}>
                {/* Overlay a frozen face crop matching the captured frame */}
                <Image
                  source={{ uri: `data:image/jpeg;base64,${alignedFrame.base64jpeg}` }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
                
                {activeLivenessActive && currentChallenge && (
                  <View style={styles.livenessOverlay}>
                    <LivenessChallenge
                      challenge={currentChallenge}
                      onComplete={() => {}}
                      status={challengeStatus}
                      progressText={progressText}
                      timeoutSeconds={4}
                    />
                  </View>
                )}
              </View>
            </View>
          )}

          {/* STATE: PROCESSING */}
          {state === 'processing' && (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#00E5FF" style={styles.processingSpinner} />
              <Text style={styles.processingText}>Enrolling securely...</Text>
              <Text style={styles.processingSubtext}>Encrypting biometric vectors locally</Text>
            </View>
          )}

          {/* STATE: SUCCESS */}
          {state === 'success' && (
            <View style={styles.feedbackContainer}>
              <Animated.View style={[styles.badge, styles.successBadge, { transform: [{ scale: badgeScale }] }]}>
                <Text style={styles.badgeIcon}>✓</Text>
              </Animated.View>

              <Text style={styles.feedbackTitle}>Enrolled Successfully</Text>
              
              <View style={styles.profileDetailsCard}>
                <Text style={styles.profileName}>{name.trim()}</Text>
                
                <View style={styles.badgeRow}>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{role}</Text>
                  </View>
                  <View style={styles.partitionBadge}>
                    <Text style={styles.partitionBadgeText}>{partition}</Text>
                  </View>
                </View>
                
                <Text style={styles.profileIdText}>ID: {enrollmentResult?.userId}</Text>
              </View>

              <Button label="Enroll Another" onPress={resetFlow} style={styles.actionBtn} />
              <Button label="Go Home" onPress={() => navigation.goBack()} variant="outline" style={styles.actionBtn} />
            </View>
          )}

          {/* STATE: ERROR */}
          {state === 'error' && (
            <View style={styles.feedbackContainer}>
              <Animated.View style={[styles.badge, styles.errorBadge, { transform: [{ scale: badgeScale }] }]}>
                <Text style={styles.badgeIcon}>✕</Text>
              </Animated.View>

              <Text style={styles.feedbackTitle}>Enrollment Failed</Text>
              <Text style={styles.errorDescription}>{getErrorMessage()}</Text>

              <Button label="Try Again" onPress={retryFromState} style={styles.actionBtn} />
              <Button label="Cancel & Go Back" onPress={resetFlow} variant="outline" style={styles.actionBtn} />
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexGrow: 1,
  },
  stepContainer: {
    flex: 1,
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
  card: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  cardHeader: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    marginBottom: 16,
    letterSpacing: 1,
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#A0A0A0',
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    height: 48,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 16,
  },
  charCount: {
    fontSize: 11,
    color: '#666666',
    textAlign: 'right',
    marginTop: 4,
  },
  readonlyPartition: {
    height: 48,
    backgroundColor: '#111111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222222',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  readonlyPartitionText: {
    color: '#888888',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1,
  },
  helperText: {
    fontSize: 11,
    color: '#666666',
    marginTop: 4,
  },
  actionBtn: {
    marginVertical: 6,
    height: 46,
  },
  cameraHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cancelLink: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 6,
  },
  cancelLinkText: {
    color: '#FF3B3B',
    fontSize: 12,
    fontWeight: '700',
  },
  cameraTitle: {
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 16,
  },
  cameraInstruction: {
    fontFamily: 'System',
    fontSize: 15,
    color: '#A0A0A0',
    textAlign: 'center',
    marginBottom: 16,
  },
  cameraContainer: {
    height: 340,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222222',
    backgroundColor: '#0F0F0F',
    marginBottom: 20,
    position: 'relative',
  },
  livenessWarning: {
    color: '#FF3B3B',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  livenessOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 10, 10, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  processingSpinner: {
    marginBottom: 24,
  },
  processingText: {
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  processingSubtext: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#666666',
  },
  feedbackContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  badge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successBadge: {
    backgroundColor: '#00E676',
  },
  errorBadge: {
    backgroundColor: '#FF1744',
  },
  badgeIcon: {
    fontSize: 40,
    color: '#0A0A0A',
    fontWeight: 'bold',
  },
  feedbackTitle: {
    fontFamily: 'System',
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  profileDetailsCard: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
  },
  profileName: {
    fontFamily: 'System',
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  roleBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderColor: 'rgba(0, 229, 255, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  roleBadgeText: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  partitionBadge: {
    backgroundColor: '#222222',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  partitionBadgeText: {
    color: '#A0A0A0',
    fontSize: 11,
    fontWeight: '700',
  },
  profileIdText: {
    fontSize: 11,
    fontFamily: 'Courier',
    color: '#666666',
  },
  errorDescription: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
});
