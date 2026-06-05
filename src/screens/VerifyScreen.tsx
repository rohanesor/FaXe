import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { CameraView } from '../components/CameraView';
import { cameraManager } from '../modules/camera/CameraManager';
import { AlignedFaceFrame } from '../types/camera';
import { LivenessResult } from '../types/liveness';
import { checkPassiveLiveness, ActiveLivenessChallenge } from '../modules/liveness';
import { VerificationState, VerificationResult, VerificationOutcome } from '../types/verification';
import { verificationManager } from '../modules/verification/VerificationManager';
import { deviceProvisioner } from '../modules/sync/DeviceProvisioner';
import { RECOGNITION_THRESHOLD } from '../utils/constants';

type Props = StackScreenProps<MainStackParamList, 'Verify'>;

export function VerifyScreen({ navigation }: Props) {
  const [state, setState] = useState<VerificationState>('camera');
  const [challengeState, setChallengeState] = useState<'none' | 'blink'>('none');
  const [alignedFrame, setAlignedFrame] = useState<AlignedFaceFrame | null>(null);
  const [livenessResult, setLivenessResult] = useState<LivenessResult | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [partition, setPartition] = useState('AFR-E-02');

  // Animations
  const breathAnim = useRef(new Animated.Value(1.0)).current;
  const doneScale = useRef(new Animated.Value(0.0)).current;
  const flashAnim = useRef(new Animated.Value(0.0)).current;
  const [flashColor, setFlashColor] = useState<'#00C853' | '#FF3B3B' | 'transparent'>('transparent');

  // Blink challenge state tracking
  const activeLiveness = useRef(new ActiveLivenessChallenge()).current;
  const challengeStartTimeRef = useRef<number>(0);
  const heldFrameRef = useRef<AlignedFaceFrame | null>(null);
  const isPipelineRunningRef = useRef<boolean>(false);

  useEffect(() => {
    // Read current partition from storage
    const cachedPartition = deviceProvisioner.getProvisioningData().partition || 'AFR-E-02';
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

  // Continuous Camera fires face aligned event
  const handleFaceAligned = async (frameData: AlignedFaceFrame, yaw?: number, pitch?: number) => {
    if (state !== 'camera' || isPipelineRunningRef.current) return;

    // ACTIVE BLINK CHALLENGE MODE
    if (challengeState === 'blink') {
      // Check timeout (6 seconds to perform a blink)
      const elapsed = Date.now() - challengeStartTimeRef.current;
      if (elapsed > 6000) {
        console.log('[VerifyScreen] Active blink challenge timed out.');
        setChallengeState('none');
        setVerificationResult({
          outcome: VerificationOutcome.SPOOF_DETECTED,
          userId: null,
          userName: null,
          role: null,
          confidence: null,
          livenessScore: 0.15,
          pipelineTimeMs: elapsed,
          message: 'Blink challenge timed out. Spoof suspected.',
        });
        triggerFlash('#FF3B3B');
        setState('done');
        return;
      }

      // Process frame for blink detection
      try {
        const result = await activeLiveness.processFrame(frameData.base64jpeg);
        if (result.isBlinkDetected) {
          console.log('[VerifyScreen] Active blink challenge PASSED!');
          setChallengeState('none');
          isPipelineRunningRef.current = true;
          setState('processing');

          // Proceed to database matching with the initially held sharp frame
          const matchingFrame = heldFrameRef.current || frameData;
          const dummyLivenessResult: LivenessResult = {
            passed: true,
            score: 0.95,
            challengeResults: [],
            reason: 'success',
          };

          const res = await verificationManager.verifyUser(matchingFrame, dummyLivenessResult, partition);
          setVerificationResult(res);
          if (res.outcome === VerificationOutcome.VERIFIED) {
            triggerFlash('#00C853');
          } else {
            triggerFlash('#FF3B3B');
          }
          setState('done');
          isPipelineRunningRef.current = false;
        }
      } catch (err) {
        console.error('[VerifyScreen] Error processing active liveness frame:', err);
      }
      return;
    }

    // SILENT PASSIVE Liveness Mode (Runs on first detected face frame)
    try {
      isPipelineRunningRef.current = true;
      const passive = await checkPassiveLiveness(frameData);

      // 1. Live Skin (LBP variance > 25) -> Direct Instant Pass
      if (passive.isLive) {
        const mappedLivenessResult: LivenessResult = {
          passed: passive.isLive,
          score: passive.confidence,
          challengeResults: [],
          reason: passive.isLive ? 'success' : 'spoof_suspected',
        };
        setAlignedFrame(frameData);
        setLivenessResult(mappedLivenessResult);
        setState('processing');

        const res = await verificationManager.verifyUser(frameData, mappedLivenessResult, partition);
        setVerificationResult(res);
        if (res.outcome === VerificationOutcome.VERIFIED) {
          triggerFlash('#00C853');
        } else {
          triggerFlash('#FF3B3B');
        }
        setState('done');
        isPipelineRunningRef.current = false;
      }
      // 2. Borderline Spoof (variance between 12.0 and 25.0) -> Trigger Active Blink Challenge
      else if (passive.variance >= 12.0 && passive.variance <= 25.0) {
        console.log(`[VerifyScreen] Borderline liveness detected (variance: ${passive.variance.toFixed(2)}). Launching Active Blink Challenge...`);
        heldFrameRef.current = frameData;
        activeLiveness.reset();
        challengeStartTimeRef.current = Date.now();
        setChallengeState('blink');
        isPipelineRunningRef.current = false; // release lock to capture blink frames
      }
      // 3. Flat Spoof (variance < 12.0) -> Immediate Outright Reject
      else {
        console.log(`[VerifyScreen] Outright passive liveness failed (variance: ${passive.variance.toFixed(2)}). Blocked.`);
        setVerificationResult({
          outcome: VerificationOutcome.SPOOF_DETECTED,
          userId: null,
          userName: null,
          role: null,
          confidence: null,
          livenessScore: passive.variance / 100,
          pipelineTimeMs: 0,
          message: 'Spoof detected via passive texture check.',
        });
        triggerFlash('#FF3B3B');
        setState('done');
        isPipelineRunningRef.current = false;
      }
    } catch (err: any) {
      console.error('[VerifyScreen] Passive pipeline check failed:', err);
      setState('done');
      isPipelineRunningRef.current = false;
    }
  };

  const handleReset = () => {
    setAlignedFrame(null);
    setLivenessResult(null);
    setVerificationResult(null);
    heldFrameRef.current = null;
    isPipelineRunningRef.current = false;
    setChallengeState('none');
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
      {/* Absolute Flash Overlay */}
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
          <CameraView
            onFaceAligned={handleFaceAligned}
            isActive={true}
            isEnrollment={false}
          />
          
          <View style={styles.cameraOverlayHeader}>
            <Pressable style={styles.cancelButton} onPress={() => navigation.goBack()}>
              <Text style={styles.cancelText}>✕ Cancel</Text>
            </Pressable>
            <Text style={styles.topBannerText}>
              {challengeState === 'blink'
                ? 'BLINK ONCE TO VERIFY LIVENESS'
                : 'Look into the camera to verify identity'}
            </Text>
          </View>

          {/* Active Liveness Challenge Glassmorphic Overlay */}
          {challengeState === 'blink' && (
            <View style={styles.challengeBox}>
              <ActivityIndicator size="small" color="#00FF88" style={{ marginBottom: 8 }} />
              <Text style={styles.challengeTitle}>Active Liveness Check</Text>
              <Text style={styles.challengeSubtitle}>Please blink once to verify you are a live operator</Text>
            </View>
          )}

          <View style={styles.cameraOverlayFooter}>
            <Text style={styles.partitionTag}>Local Cache Partition: {partition}</Text>
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
                    Liveness status: Verified 🟢
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
                    Threshold required: {Math.round(RECOGNITION_THRESHOLD * 100)}%
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
                  Please present your real face. Photos, masks, and screens are not accepted.
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
                  {verificationResult.message &&
                   (verificationResult.message.toLowerCase().includes('corrupted') ||
                    verificationResult.message.toLowerCase().includes('re-enroll')) && (
                    <Button
                      label="Re-enroll Users"
                      onPress={() => navigation.navigate('Enroll')}
                      variant="primary"
                      style={styles.doneBtn}
                    />
                  )}
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
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
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
    borderColor: '#33,',
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
    fontSize: 15,
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
  challengeBox: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    transform: [{ translateY: 130 }],
    backgroundColor: 'rgba(10, 10, 10, 0.9)',
    borderColor: '#00FF88',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    zIndex: 25,
  },
  challengeTitle: {
    color: '#00FF88',
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  challengeSubtitle: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
  breathingCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0, 229, 255, 0.07)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerProcessingCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderWidth: 1.5,
    borderColor: '#00E5FF',
  },
  processingText: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 24,
    letterSpacing: 0.5,
  },
  doneContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    padding: 24,
  },
  outcomeSubContainer: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#00C853',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successCheckmark: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
  },
  failedIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF3B3B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  failedCross: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
  },
  spoofIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF9100',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  spoofExclamation: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
  },
  warningIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFD600',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  warningIcon: {
    fontSize: 32,
  },
  userNameText: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 20,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  failTitleText: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  failSubtext: {
    color: '#A0A0A0',
    fontFamily: 'System',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  metricsBox: {
    width: '100%',
    backgroundColor: '#0A0A0A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222222',
    padding: 16,
    marginBottom: 24,
  },
  metricItemText: {
    color: '#888888',
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '600',
    marginVertical: 4,
    textAlign: 'center',
  },
  doneActions: {
    width: '100%',
    flexDirection: 'column',
  },
  doneBtn: {
    width: '100%',
    height: 48,
    marginVertical: 6,
  },
});
