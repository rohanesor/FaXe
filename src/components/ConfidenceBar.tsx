import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface Props {
  value: number; // 0 to 1
  label: string;
  color?: string;
}

/**
 * Premium animated progress bar showing metrics like confidence or liveness.
 * Automatically handles HSL/RGB coloring based on the performance threshold.
 */
export function ConfidenceBar({ value, label, color }: Props) {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  // Clamp value between 0 and 1
  const clampedValue = Math.min(Math.max(value, 0), 1);

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: clampedValue,
      duration: 600,
      useNativeDriver: false, // width cannot be animated using native driver
    }).start();
  }, [clampedValue, animatedWidth]);

  // Determine bar color if not overridden
  const getBarColor = () => {
    if (color) return color;
    if (clampedValue > 0.85) return '#00C853'; // Premium Green
    if (clampedValue >= 0.65) return '#FFD600'; // Yellow
    return '#FF3B3B'; // Red
  };

  const percentage = `${(clampedValue * 100).toFixed(0)}%`;
  const activeColor = getBarColor();

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.valueText, { color: activeColor }]}>{percentage}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: animatedWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
              backgroundColor: activeColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '600',
    color: '#A0A0A0',
  },
  valueText: {
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    height: 8,
    backgroundColor: '#222222',
    borderRadius: 4,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
