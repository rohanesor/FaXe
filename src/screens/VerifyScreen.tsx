import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
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

type Props = StackScreenProps<MainStackParamList, 'Verify'>;

export function VerifyScreen({ navigation }: Props) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [alignedFrame, setAlignedFrame] = useState<AlignedFaceFrame | null>(null);

  // Active Liveness UI States
  const [activeLivenessActive, setActiveLivenessActive] = useState(false);
  const [currentChallenge, setCurrentChallenge] = useState<ChallengeType | null>(null);
  const [challengeStatus, setChallengeStatus] = useState<'active' | 'passed' | 'failed'>('active');
  const [progressText, setProgressText] = useState('');
  const [livenessError, setLivenessError] = useState<string | null>(null);

  useEffect(() => {
    const initPermissions = async () => {
      const hasPerm = await cameraManager.hasPermission();
      if (!hasPerm) {
        const granted = await cameraManager.requestPermission();
        if (!granted) {
          Alert.alert(
            'Camera Access Required',
            'Please enable camera access in your device settings to execute biometric identity checks.'
          );
        }
      }
    };
    initPermissions();
  }, []);

  // Generates coordinate feeds that mimic human alignment gestures over time
  const getSimulatedLandmarksForChallenge = (challenge: ChallengeType, tick: number): Landmark[] => {
    const baseLandmarks: Landmark[] = [
      { x: 100, y: 100 }, // 0: Left Eye center
      { x: 200, y: 100 }, // 1: Right Eye center
      { x: 150, y: 150 }, // 2: Nose Tip
      { x: 110, y: 200 }, // 3: Mouth Left
      { x: 190, y: 200 }, // 4: Mouth Right
      { x: 150, y: 240 }, // 5: Chin
      { x: 0, y: 0.35 },  // 6: Left Eye EAR
      { x: 0, y: 0.35 },  // 7: Right Eye EAR
    ];

    switch (challenge) {
      case ChallengeType.BLINK:
        // Closed eyes after 6 ticks (1.2 seconds)
        if (tick >= 6 && tick <= 8) {
          baseLandmarks[6].y = 0.05;
          baseLandmarks[7].y = 0.05;
        }
        break;
      case ChallengeType.SMILE:
        // Mouth stretches wider after 6 ticks
        if (tick >= 6) {
          baseLandmarks[3].x = 90;  // moves left
          baseLandmarks[4].x = 210; // moves right
        }
        break;
      case ChallengeType.TURN_LEFT:
        // Nose shifts to the left relative to eyes
        if (tick >= 6) {
          baseLandmarks[2].x = 95;
        }
        break;
      case ChallengeType.TURN_RIGHT:
        // Nose shifts to the right relative to eyes
        if (tick >= 6) {
          baseLandmarks[2].x = 205;
        }
        break;
      case ChallengeType.NOD:
        // Nose shifts down (ticks 6-8) then back up (ticks 9+)
        if (tick >= 6 && tick <= 8) {
          baseLandmarks[2].y = 185; // shifts down
        } else if (tick >= 9) {
          baseLandmarks[2].y = 152; // shifts back up
        }
        break;
    }

    return baseLandmarks;
  };

  const handleFaceAligned = async (frameData: AlignedFaceFrame) => {
    console.log('[VerifyScreen] Face aligned, running liveness pipeline...');
    setAlignedFrame(frameData);
    setLivenessError(null);

    // Promise wrapper executing active challenges frame-loop
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
        console.log('LIVENESS PASSED', livenessResult.score);
        Alert.alert('Verification Success', 'Liveness checks passed. Matching database vectors...');
        
        // Auto navigate to result page with match
        navigation.navigate('Result', {
          result: {
            matched: true,
            userId: 'usr-4129',
            confidence: 0.965,
            livenessScore: livenessResult.score,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        console.log('LIVENESS FAILED', livenessResult.reason);
        
        if (livenessResult.reason === 'spoof_suspected') {
          // Direct fail to Result screen indicating Spoof suspected
          navigation.navigate('Result', {
            result: {
              matched: false,
              confidence: 0.89,
              livenessScore: livenessResult.score,
              timestamp: new Date().toISOString(),
            },
          });
        } else {
          setLivenessError('Liveness check failed (timeout). Please try again.');
          setAlignedFrame(null);
        }
      }
    } catch (err) {
      console.error('Liveness execution error:', err);
      setLivenessError('A system error occurred during liveness check.');
      setAlignedFrame(null);
    }
  };

  const handleSimulateMatch = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      navigation.navigate('Result', {
        result: {
          matched: true,
          userId: 'usr-4129',
          confidence: 0.942,
          livenessScore: 0.915,
          timestamp: new Date().toISOString(),
        },
      });
    }, 1200);
  };

  const handleSimulateFailure = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      navigation.navigate('Result', {
        result: {
          matched: false,
          confidence: 0.314,
          livenessScore: 0.887,
          timestamp: new Date().toISOString(),
        },
      });
    }, 1200);
  };

  const handleSimulateSpoof = () => {
    // Inject spoof frame (triggering instant LBP variance failure)
    const spoofFrame: AlignedFaceFrame = {
      timestamp: Date.now(),
      width: 112,
      height: 112,
      base64jpeg: 'data:image/jpeg;base64,spoof_frame_descriptor_variance_zero',
    };
    handleFaceAligned(spoofFrame);
  };

  const handleRetry = () => {
    setLivenessError(null);
    setAlignedFrame(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {activeLivenessActive && currentChallenge && (
        <LivenessChallenge
          challenge={currentChallenge}
          onComplete={() => {}} // Controlled reactively by the feedLoop promise wrapper
          status={challengeStatus}
          progressText={progressText}
          timeoutSeconds={4}
        />
      )}

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Identity Verification</Text>
          <Text style={styles.subtitle}>OFFLINE BIOMETRIC ANALYSIS</Text>
        </View>

        {livenessError ? (
          /* Error display with manual retry */
          <View style={styles.errorCard}>
            <Text style={styles.errorIcon}>⚠</Text>
            <Text style={styles.errorText}>{livenessError}</Text>
            <Button
              label="Retry Verification"
              onPress={handleRetry}
              variant="outline"
              style={styles.retryBtn}
            />
          </View>
        ) : (
          /* Live Camera Viewport */
          <View style={styles.cameraContainer}>
            <CameraView onFaceAligned={handleFaceAligned} isActive={!isAnalyzing && !alignedFrame} />
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardHeader}>Developer Test Simulation</Text>
          <Text style={styles.cardDescription}>
            In addition to letting the camera overlay align automatically, use these presets to manually simulate biometric outcomes.
          </Text>

          <Button
            label="Simulate Verified Match"
            onPress={handleSimulateMatch}
            disabled={isAnalyzing || activeLivenessActive}
            variant="success"
            style={styles.simBtn}
          />

          <Button
            label="Simulate Identity Mismatch"
            onPress={handleSimulateFailure}
            disabled={isAnalyzing || activeLivenessActive}
            variant="danger"
            style={styles.simBtn}
          />

          <Button
            label="Simulate Liveness Spoof Attack"
            onPress={handleSimulateSpoof}
            disabled={isAnalyzing || activeLivenessActive}
            variant="outline"
            style={[styles.simBtn, styles.spoofOutlineBtn]}
          />
        </View>

        <Button
          label="Cancel Verification"
          onPress={() => navigation.goBack()}
          disabled={isAnalyzing || activeLivenessActive}
          style={styles.cancelBtn}
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
  cameraContainer: {
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222222',
    marginBottom: 20,
  },
  errorCard: {
    height: 320,
    borderRadius: 16,
    backgroundColor: '#161616',
    borderWidth: 1.5,
    borderColor: '#FF3B3B',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 48,
    color: '#FF3B3B',
    marginBottom: 16,
  },
  errorText: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryBtn: {
    width: '80%',
    borderColor: '#FF3B3B',
  },
  card: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  cardHeader: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 1,
  },
  cardDescription: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#666666',
    lineHeight: 18,
    marginBottom: 16,
  },
  simBtn: {
    marginVertical: 6,
    height: 46,
  },
  spoofOutlineBtn: {
    borderColor: '#FF3B3B',
  },
  cancelBtn: {
    marginTop: 'auto',
  },
});
