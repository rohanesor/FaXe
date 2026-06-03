import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface StepIndicatorProps {
  currentStep: number; // 0: Form, 1: Camera/Liveness, 2: Success/Complete
}

/**
 * Premium step indicator component that shows progress during enrollment.
 * Features spring animations when transitioning between states.
 */
export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const scale0 = useRef(new Animated.Value(currentStep === 0 ? 1.3 : 1)).current;
  const scale1 = useRef(new Animated.Value(currentStep === 1 ? 1.3 : 1)).current;
  const scale2 = useRef(new Animated.Value(currentStep === 2 ? 1.3 : 1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale0, {
        toValue: currentStep === 0 ? 1.3 : 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(scale1, {
        toValue: currentStep === 1 ? 1.3 : 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(scale2, {
        toValue: currentStep === 2 ? 1.3 : 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentStep, scale0, scale1, scale2]);

  const steps = [
    { label: 'Profile', scale: scale0 },
    { label: 'Biometrics', scale: scale1 },
    { label: 'Complete', scale: scale2 },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.dotsContainer}>
        {steps.map((step, idx) => {
          const isActive = currentStep === idx;
          const isCompleted = currentStep > idx;
          
          let dotColor = '#444444'; // grey for pending
          if (isActive) {
            dotColor = '#00E5FF'; // cyan for active
          } else if (isCompleted) {
            dotColor = '#FFFFFF'; // white for completed
          }

          return (
            <View key={idx} style={styles.stepWrapper}>
              {idx > 0 && (
                <View 
                  style={[
                    styles.connectorLine, 
                    currentStep >= idx ? styles.activeConnector : styles.pendingConnector
                  ]} 
                />
              )}
              <Animated.View
                style={[
                  styles.dot,
                  {
                    backgroundColor: dotColor,
                    transform: [{ scale: step.scale }],
                  },
                ]}
              />
              <Text 
                style={[
                  styles.label, 
                  isActive && styles.activeLabel, 
                  isCompleted && styles.completedLabel
                ]}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '90%',
  },
  stepWrapper: {
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    width: 80,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    zIndex: 2,
    marginBottom: 6,
  },
  connectorLine: {
    position: 'absolute',
    height: 2,
    width: 60,
    top: 6,
    right: 40,
    zIndex: 1,
  },
  activeConnector: {
    backgroundColor: '#00E5FF',
  },
  pendingConnector: {
    backgroundColor: '#333333',
  },
  label: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: '600',
    color: '#666666',
  },
  activeLabel: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  completedLabel: {
    color: '#FFFFFF',
  },
});
