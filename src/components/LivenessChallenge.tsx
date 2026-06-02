import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { ChallengeType } from '../types/liveness';

interface LivenessChallengeProps {
  challenge: ChallengeType;
  onComplete: (passed: boolean) => void;
  timeoutSeconds: number;
  status?: 'active' | 'passed' | 'failed';
  progressText?: string;
}

export function LivenessChallenge({
  challenge,
  onComplete,
  timeoutSeconds = 4,
  status = 'active',
  progressText = 'Challenge 1 of 2',
}: LivenessChallengeProps) {
  const [secondsLeft, setSecondsLeft] = useState(timeoutSeconds);
  const timerAnim = useRef(new Animated.Value(1)).current;
  const statusScale = useRef(new Animated.Value(0)).current;
  const statusOpacity = useRef(new Animated.Value(0)).current;

  const getChallengeDetails = () => {
    switch (challenge) {
      case ChallengeType.BLINK:
        return { text: 'BLINK YOUR EYES', color: '#00E5FF', subtitle: 'Look directly into camera' };
      case ChallengeType.SMILE:
        return { text: 'SMILE BROADLY', color: '#00C853', subtitle: 'Show your teeth' };
      case ChallengeType.TURN_LEFT:
        return { text: 'TURN FACE LEFT', color: '#FFB300', subtitle: 'Slowly rotate head' };
      case ChallengeType.TURN_RIGHT:
        return { text: 'TURN FACE RIGHT', color: '#FFB300', subtitle: 'Slowly rotate head' };
      case ChallengeType.NOD:
        return { text: 'NOD YOUR HEAD', color: '#00E5FF', subtitle: 'Tilt down then up' };
    }
  };

  const details = getChallengeDetails();

  useEffect(() => {
    if (status !== 'active') return;

    setSecondsLeft(timeoutSeconds);
    timerAnim.setValue(1);

    Animated.timing(timerAnim, {
      toValue: 0,
      duration: timeoutSeconds * 1000,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 0.1) {
          clearInterval(interval);
          onComplete(false);
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);

    return () => {
      clearInterval(interval);
      timerAnim.stopAnimation();
    };
  }, [challenge, status, timeoutSeconds, onComplete, timerAnim]);

  useEffect(() => {
    if (status === 'passed' || status === 'failed') {
      statusScale.setValue(0.3);
      statusOpacity.setValue(0);

      Animated.parallel([
        Animated.spring(statusScale, {
          toValue: 1.0,
          friction: 4,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(statusOpacity, {
          toValue: 1.0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [status, statusScale, statusOpacity]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.progressText}>{progressText}</Text>
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBarFill,
              progressText.includes('2') ? styles.barFull : styles.barHalf,
            ]}
          />
        </View>
      </View>

      <View style={styles.board}>
        {status === 'active' ? (
          <View style={styles.timerContainer}>
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [{ scale: timerAnim.interpolate({ inputRange: [0, 1], outputRange: [1.2, 0.95] }) }],
                  opacity: timerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.1, 0.4, 0.8] }),
                  borderColor: details.color,
                },
              ]}
            />
            <View style={[styles.innerCircle, { borderColor: details.color }]}>
              <Text style={styles.timerText}>{secondsLeft.toFixed(1)}s</Text>
              <Text style={styles.timerLabel}>Remaining</Text>
            </View>
          </View>
        ) : (
          <Animated.View
            style={[
              styles.outcomeCircle,
              status === 'passed' ? styles.outcomePassed : styles.outcomeFailed,
              {
                opacity: statusOpacity,
                transform: [{ scale: statusScale }],
              },
            ]}
          >
            <Text
              style={[
                styles.outcomeText,
                status === 'passed' ? styles.textPassed : styles.textFailed,
              ]}
            >
              {status === 'passed' ? '✓' : '✗'}
            </Text>
          </Animated.View>
        )}

        <View style={styles.instructionContainer}>
          <Text style={[styles.instruction, { color: details.color }]}>
            {details.text}
          </Text>
          <Text style={styles.subtitle}>{details.subtitle}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 10, 10, 0.94)',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 40,
    zIndex: 999,
  },
  topBar: {
    alignItems: 'center',
    marginTop: 20,
  },
  progressText: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    color: '#A0A0A0',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  progressBarContainer: {
    width: '60%',
    height: 4,
    backgroundColor: '#222222',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00E5FF',
  },
  board: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerContainer: {
    width: 170,
    height: 170,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 32,
  },
  pulseRing: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 2,
  },
  innerCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3.5,
    backgroundColor: '#161616',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  timerText: {
    fontFamily: 'System',
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  timerLabel: {
    fontFamily: 'System',
    fontSize: 11,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  outcomeCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  outcomeText: {
    fontSize: 72,
    fontWeight: 'bold',
  },
  instructionContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  instruction: {
    fontFamily: 'System',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#A0A0A0',
    textAlign: 'center',
  },
  barHalf: {
    width: '50%',
  },
  barFull: {
    width: '100%',
  },
  outcomePassed: {
    backgroundColor: 'rgba(0, 200, 83, 0.1)',
    borderColor: '#00C853',
  },
  outcomeFailed: {
    backgroundColor: 'rgba(255, 59, 59, 0.1)',
    borderColor: '#FF3B3B',
  },
  textPassed: {
    color: '#00C853',
  },
  textFailed: {
    color: '#FF3B3B',
  },
});
