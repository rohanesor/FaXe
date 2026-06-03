import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { CameraView } from '../components/CameraView';
import { cameraManager } from '../modules/camera/CameraManager';
import { AlignedFaceFrame } from '../types/camera';
import { ChallengeType, LivenessResult } from '../types/liveness';
import { LivenessChallenge } from '../components/LivenessChallenge';
import { LivenessOrchestrator } from '../modules/liveness/LivenessOrchestrator';
import { Landmark } from '../modules/liveness/LandmarkTracker';
import { runLivenessCheck } from '../modules/liveness';
import { VerificationState, VerificationResult, VerificationOutcome } from '../types/verification';
import { verificationManager } from '../modules/verification/VerificationManager';
import { storage } from '../store';

type Props = StackScreenProps<MainStackParamList, 'Verify'>;

export function VerifyScreen({ navigation }: Props) {
  const [state, setState] = useState<VerificationState>('camera');
  const [alignedFrame, setAlignedFrame] = useState<AlignedFaceFrame | null>(null);
  const [livenessResult, setLivenessResult] = useState<LivenessResult | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [partition, setPartition] = useState('AFR-E-02');

  // Liveness execution UI helper states
  const [activeLivenessActive, setActiveLivenessActive] = useState(false);
  const [currentChallenge, setCurrentChallenge] = useState<ChallengeType | null>(null);
  const [challengeStatus, setChallengeStatus] = useState<'active' | 'passed' | 'failed'>('active');
  const [progressText, setProgressText] = useState('');

  // Animations
  const breathAnim = useRef(new Animated.Value(1.0)).current;
  const doneScale = useRef(new Animated.Value(0.0)).current;
  const flashAnim = useRef(new Animated.Value(0.0)).current;
  const [flashColor, setFlashColor] = useState<'#00C853' | '#FF3B3B' | 'transparent'>('transparent');

  useEffect(() => {
    // Read current partition from storage
    const cachedPartition = storage.getString('partition') || 'AFR-E-02';
    setPartition(cachedPartition);

    // Initial camera permission verification
    const initPermissions = async () => {
      const hasPerm = await cameraManager.hasPermission();
      if (!hasPerm) {
        const granted = await cameraManager.requestPermission();
        if (!granted) {
          Alert.alert(
            'Camera Access Required',
            'Please enable camera access in settings to verify identities.'
          );
          navigation.goBack();
        }
      }
    };
    initPermissions();
  }, [navigation]);

  // Breathing circle animation loop during verification inference
  useEffect(() => {
    if (state === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathAnim, {
            toValue: 1.18,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(breathAnim, {
            toValue: 1.0,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      breathAnim.setValue(1.0);
    }
  }, [state, breathAnim]);

  // Settle-in spring animation for the done card checkmarks or badges
  useEffect(() => {
    if (state === 'done') {
      doneScale.setValue(0.0);
      Animated.spring(doneScale, {
        toValue: 1.0,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  }, [state, doneScale]);

  // Trigger brief green or red overlay flashes on completion
  const triggerFlash = useCallback((color: '#00C853' | '#FF3B3B') => {
    setFlashColor(color);
    flashAnim.setValue(1.0);
    Animated.timing(flashAnim, {
      toValue: 0.0,
      duration: 500,
      useNativeDriver: true,
    }).start(() => setFlashColor('transparent'));
  }, [flashAnim]);

  // Helper mapping face landmarks for liveness challenge simulations
  const getSimulatedLandmarksForChallenge = (challenge: ChallengeType, tick: number): Landmark[] => {
    const baseLandmarks: Landmark[] = [
      { x: 100, y: 100 }, // 0: Left Eye
      { x: 200, y: 100 }, // 1: Right Eye
      { x: 150, y: 150 }, // 2: Nose Tip
      { x: 110, y: 200 }, // 3: Mouth Left
      { x: 190, y: 200 }, // 4: Mouth Right
      { x: 150, y: 240 }, // 5: Chin
      { x: 0, y: 0.35 },  // 6: Left Eye EAR
      { x: 0, y: 0.35 },  // 7: Right Eye EAR
    ];

    switch (challenge) {
      case ChallengeType.BLINK:
        if (tick >= 5 && tick <= 7) {
          baseLandmarks[6].y = 0.05;
          baseLandmarks[7].y = 0.05;
        }
        break;
      case ChallengeType.SMILE:
        if (tick >= 5) {
          baseLandmarks[3].x = 85;
          baseLandmarks[4].x = 215;
        }
        break;
      case ChallengeType.TURN_LEFT:
        if (tick >= 5) {
          baseLandmarks[2].x = 90;
        }
        break;
      case ChallengeType.TURN_RIGHT:
        if (tick >= 5) {
          baseLandmarks[2].x = 210;
        }
        break;
      case ChallengeType.NOD:
        if (tick >= 5 && tick <= 7) {
          baseLandmarks[2].y = 180;
        } else if (tick >= 8) {
          baseLandmarks[2].y = 150;
        }
        break;
    }
    return baseLandmarks;
  };

  // Step 1: Camera fires face aligned event
  const handleFaceAligned = (frameData: AlignedFaceFrame) => {
    console.log('[VerifyScreen] Face aligned, freezing frame and starting liveness checks...');
    setAlignedFrame(frameData);
    setState('liveness');
  };

  // Step 2: Running Liveness loop on state enter
  useEffect(() => {
    if (state === 'liveness' && alignedFrame) {
      let isSubscribed = true;

      const executeLiveness = async () => {
        try {
          const runActiveChecks = () => {
            return new Promise<LivenessResult>((resolve) => {
              const orchestrator = new LivenessOrchestrator();
              orchestrator.startSession();

              if (!isSubscribed) return;
              setActiveLivenessActive(true);
              setCurrentChallenge(orchestrator.getCurrentChallenge());
              setChallengeStatus('active');
              setProgressText(orchestrator.getProgressText());

              let simTick = 0;
              let timer: any;

              const feedLoop = () => {
                if (!isSubscribed) {
                  clearInterval(timer);
                  return;
                }

                const curChallenge = orchestrator.getCurrentChallenge();
                if (!curChallenge) {
                  clearInterval(timer);
                  return;
                }

                simTick++;
                const mockLandmarks = getSimulatedLandmarksForChallenge(curChallenge, simTick);
                const feed = orchestrator.feedLandmarks(mockLandmarks);

                if (feed.passed) {
                  setChallengeStatus('passed');
                  clearInterval(timer);

                  setTimeout(() => {
                    if (!isSubscribed) return;
                    if (feed.completed) {
                      setActiveLivenessActive(false);
                      resolve(feed.result!);
                    } else {
                      setCurrentChallenge(orchestrator.getCurrentChallenge());
                      setChallengeStatus('active');
                      setProgressText(orchestrator.getProgressText());
                      simTick = 0;
                      timer = setInterval(feedLoop, 200);
                    }
                  }, 1000);
                } else if (feed.completed) {
                  clearInterval(timer);
                  setChallengeStatus('failed');

                  setTimeout(() => {
                    if (!isSubscribed) return;
                    setActiveLivenessActive(false);
                    resolve(feed.result!);
                  }, 1000);
                }
              };

              timer = setInterval(feedLoop, 200);
            });
          };

          // Run the full liveness check wrapper
          const result = await runLivenessCheck(() => alignedFrame, runActiveChecks);

          if (isSubscribed) {
            setLivenessResult(result);
            setState('processing');
          }
        } catch (err) {
          console.error('[VerifyScreen] Liveness loop failed:', err);
          if (isSubscribed) {
            setVerificationResult({
              outcome: VerificationOutcome.ERROR,
              userId: null,
              userName: null,
              role: null,
              confidence: null,
              livenessScore: 0.0,
              pipelineTimeMs: 0,
              message: 'Liveness sequence check failed with a system exception.',
            });
            setState('done');
          }
        }
      };

      executeLiveness();

      return () => {
        isSubscribed = false;
      };
    }
  }, [state, alignedFrame]);

  // Step 3: Run database scan during 'processing'
  useEffect(() => {
    if (state === 'processing' && alignedFrame && livenessResult) {
      let isSubscribed = true;

      const runAuthMatching = async () => {
        try {
          const res = await verificationManager.verifyUser(alignedFrame, livenessResult, partition);

          if (isSubscribed) {
            setVerificationResult(res);

            // Execute corresponding feedback flash
            if (res.outcome === VerificationOutcome.VERIFIED) {
              triggerFlash('#00C853'); // Green
            } else if (res.outcome === VerificationOutcome.SPOOF_DETECTED) {
              triggerFlash('#FF3B3B'); // Red
            }

            setState('done');
          }
        } catch (err: any) {
          console.error('[VerifyScreen] Verification execution error:', err);
          if (isSubscribed) {
            setVerificationResult({
              outcome: VerificationOutcome.ERROR,
              userId: null,
              userName: null,
              role: null,
              confidence: null,
              livenessScore: livenessResult.score,
              pipelineTimeMs: 0,
              message: err.message || 'An unexpected error occurred during database face matching.',
            });
            setState('done');
          }
        }
      };

      runAuthMatching();

      return () => {
        isSubscribed = false;
      };
    }
  }, [state, alignedFrame, livenessResult, partition, triggerFlash]);

  const handleReset = () => {
    setAlignedFrame(null);
    setLivenessResult(null);
    setVerificationResult(null);
    setState('camera');
  };

  const getRoleBadgeStyle = (roleName: string) => {
    const formatted = roleName.toLowerCase();
    if (formatted === 'admin') return { bg: '#FF6D00', text: '#FFFFFF', label: 'Admin' };
    if (formatted === 'worker') return { bg: '#00A3FF', text: '#FFFFFF', label: 'Worker' };
    return { bg: '#757575', text: '#FFFFFF', label: 'Visitor' };
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Absolute Flash Overlay for UI transitions */}
      {flashColor !== 'transparent' && (
        <Animated.View
          style={[
            styles.flashOverlay,
            {
              backgroundColor: flashColor,
              opacity: flashAnim,
            },
          ]}
          pointerEvents="none"
        />
      )}

      {/* STATE 1: CAMERA */}
      {state === 'camera' && (
        <View style={styles.fullscreenContainer}>
          <CameraView onFaceAligned={handleFaceAligned} isActive={true} />
          
          <View style={styles.cameraOverlayHeader}>
            <Pressable style={styles.cancelButton} onPress={() => navigation.goBack()}>
              <Text style={styles.cancelText}>✕ Cancel</Text>
            </Pressable>
            <Text style={styles.topBannerText}>Look into the camera to verify identity</Text>
          </View>

          <View style={styles.cameraOverlayFooter}>
            <Text style={styles.partitionTag}>Local Cache Partition: {partition}</Text>
          </View>
        </View>
      )}

      {/* STATE 2: LIVENESS */}
      {state === 'liveness' && alignedFrame && (
        <View style={styles.fullscreenContainer}>
          <Image
            source={{ uri: alignedFrame.base64jpeg }}
            style={[StyleSheet.absoluteFill, styles.frozenPreview]}
            resizeMode="cover"
          />
          
          {activeLivenessActive && currentChallenge && (
            <LivenessChallenge
              challenge={currentChallenge}
              onComplete={() => {}} // Hooked inside liveness feed promise loops
              status={challengeStatus}
              progressText={progressText}
              timeoutSeconds={4}
            />
          )}

          <View style={styles.livenessOverlayFooter}>
            <Text style={styles.livenessWarningText}>Anti-spoofing check in progress</Text>
          </View>
        </View>
      )}

      {/* STATE 3: PROCESSING */}
      {state === 'processing' && (
        <View style={styles.processingContainer}>
          <Animated.View
            style={[
              styles.breathingCircle,
              { transform: [{ scale: breathAnim }] },
            ]}
          >
            <View style={styles.innerProcessingCircle} />
          </Animated.View>
          <Text style={styles.processingText}>Verifying identity...</Text>
        </View>
      )}

      {/* STATE 4: DONE */}
      {state === 'done' && verificationResult && (
        <View style={styles.doneContainer}>
          <Animated.ScrollView
            contentContainerStyle={styles.doneScrollContent}
            style={{ transform: [{ scale: doneScale }] }}
          >
            {/* Outcome Render: VERIFIED */}
            {verificationResult.outcome === VerificationOutcome.VERIFIED && (
              <View style={styles.outcomeSubContainer}>
                <View style={styles.successIconCircle}>
                  <Text style={styles.successCheckmark}>✓</Text>
                </View>
                <Text style={styles.userNameText}>{verificationResult.userName}</Text>
                
                {verificationResult.role && (
                  <View
                    style={[
                      styles.roleBadge,
                      { backgroundColor: getRoleBadgeStyle(verificationResult.role).bg },
                    ]}
                  >
                    <Text style={styles.roleBadgeText}>
                      {getRoleBadgeStyle(verificationResult.role).label}
                    </Text>
                  </View>
                )}

                <View style={styles.metricsBox}>
                  <Text style={styles.metricItemText}>
                    Match confidence: {((verificationResult.confidence || 0) * 100).toFixed(0)}%
                  </Text>
                  <Text style={styles.metricItemText}>
                    Liveness score: {((verificationResult.livenessScore || 0) * 100).toFixed(0)}%
                  </Text>
                  <Text style={styles.metricItemText}>
                    Verified in {verificationResult.pipelineTimeMs}ms
                  </Text>
                </View>

                <View style={styles.doneActions}>
                  <Button
                    label="Verify Another"
                    onPress={handleReset}
                    variant="success"
                    style={styles.doneBtn}
                  />
                  <Button
                    label="Done"
                    onPress={() => navigation.navigate('Home')}
                    variant="outline"
                    style={styles.doneBtn}
                  />
                </View>
              </View>
            )}

            {/* Outcome Render: NOT_RECOGNIZED */}
            {verificationResult.outcome === VerificationOutcome.NOT_RECOGNIZED && (
              <View style={styles.outcomeSubContainer}>
                <View style={styles.failedIconCircle}>
                  <Text style={styles.failedCross}>✕</Text>
                </View>
                <Text style={styles.failTitleText}>Identity not recognized</Text>
                <Text style={styles.failSubtext}>
                  This face does not match any enrolled user in this location.
                </Text>

                <View style={styles.metricsBox}>
                  <Text style={styles.metricItemText}>
                    Best match: {((verificationResult.confidence || 0) * 100).toFixed(0)}%
                  </Text>
                  <Text style={styles.metricItemText}>
                    Threshold required: 75%
                  </Text>
                </View>

                <View style={styles.doneActions}>
                  <Button
                    label="Try Again"
                    onPress={handleReset}
                    variant="danger"
                    style={styles.doneBtn}
                  />
                </View>
              </View>
            )}

            {/* Outcome Render: SPOOF_DETECTED */}
            {verificationResult.outcome === VerificationOutcome.SPOOF_DETECTED && (
              <View style={styles.outcomeSubContainer}>
                <View style={styles.spoofIconCircle}>
                  <Text style={styles.spoofExclamation}>!</Text>
                </View>
                <Text style={styles.failTitleText}>Spoofing attempt detected</Text>
                <Text style={styles.failSubtext}>
                  Please present your real face. Photos and screens are not accepted.
                </Text>

                <View style={styles.metricsBox}>
                  <Text style={styles.metricItemText}>
                    Liveness score: {((verificationResult.livenessScore || 0) * 100).toFixed(0)}%
                  </Text>
                  <Text style={styles.metricItemText}>
                    Threshold required: 50%
                  </Text>
                </View>

                <View style={styles.doneActions}>
                  <Button
                    label="Try Again"
                    onPress={handleReset}
                    variant="danger"
                    style={styles.doneBtn}
                  />
                </View>
              </View>
            )}

            {/* Outcome Render: NO_USERS_ENROLLED */}
            {verificationResult.outcome === VerificationOutcome.NO_USERS_ENROLLED && (
              <View style={styles.outcomeSubContainer}>
                <View style={styles.warningIconCircle}>
                  <Text style={styles.warningIcon}>⚠️</Text>
                </View>
                <Text style={styles.failTitleText}>No users enrolled</Text>
                <Text style={styles.failSubtext}>
                  Please enroll users in this local partition before running verification.
                </Text>

                <View style={styles.doneActions}>
                  <Button
                    label="Go to Enroll"
                    onPress={() => navigation.navigate('Enroll')}
                    style={styles.doneBtn}
                  />
                </View>
              </View>
            )}

            {/* Outcome Render: ERROR */}
            {verificationResult.outcome === VerificationOutcome.ERROR && (
              <View style={styles.outcomeSubContainer}>
                <View style={styles.failedIconCircle}>
                  <Text style={styles.failedCross}>⚠</Text>
                </View>
                <Text style={styles.failTitleText}>Verification error</Text>
                <Text style={styles.failSubtext}>
                  {verificationResult.message || 'An unexpected biometric matching error occurred.'}
                </Text>

                <View style={styles.doneActions}>
                  <Button
                    label="Try Again"
                    onPress={handleReset}
                    variant="outline"
                    style={styles.doneBtn}
                  />
                </View>
              </View>
            )}
          </Animated.ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  fullscreenContainer: {
    flex: 1,
    position: 'relative',
  },
  frozenPreview: {
    opacity: 0.4,
  },
  cameraOverlayHeader: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 10,
  },
  cancelButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(25, 25, 25, 0.7)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 20,
  },
  cancelText: {
    color: '#FFF',
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '600',
  },
  topBannerText: {
    color: '#FFF',
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: 'rgba(10, 10, 10, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cameraOverlayFooter: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    zIndex: 10,
  },
  partitionTag: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontFamily: 'System',
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  livenessOverlayFooter: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  livenessWarningText: {
    color: '#00E5FF',
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  processingContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  breathingCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    borderWidth: 2,
    borderColor: '#00E5FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  innerProcessingCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00E5FF',
  },
  processingText: {
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  doneContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  doneScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  outcomeSubContainer: {
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#222222',
    paddingVertical: 40,
    paddingHorizontal: 24,
    width: '100%',
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 200, 83, 0.1)',
    borderWidth: 2,
    borderColor: '#00C853',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successCheckmark: {
    color: '#00C853',
    fontSize: 36,
    fontWeight: '900',
  },
  failedIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 59, 59, 0.1)',
    borderWidth: 2,
    borderColor: '#FF3B3B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  failedCross: {
    color: '#FF3B3B',
    fontSize: 32,
    fontWeight: '700',
  },
  spoofIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 59, 59, 0.15)',
    borderWidth: 2.5,
    borderColor: '#FF3B3B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  spoofExclamation: {
    color: '#FF3B3B',
    fontSize: 40,
    fontWeight: '900',
  },
  warningIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 214, 0, 0.1)',
    borderWidth: 2,
    borderColor: '#FFD600',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  warningIcon: {
    fontSize: 32,
  },
  userNameText: {
    fontFamily: 'System',
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 24,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
  },
  failTitleText: {
    fontFamily: 'System',
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  failSubtext: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  metricsBox: {
    width: '100%',
    backgroundColor: '#0A0A0A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222222',
    padding: 16,
    marginBottom: 28,
  },
  metricItemText: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '600',
    marginVertical: 4,
    letterSpacing: 0.5,
  },
  doneActions: {
    width: '100%',
  },
  doneBtn: {
    marginVertical: 6,
    height: 50,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 999,
  },
});
