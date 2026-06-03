import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated } from 'react-native';

interface Props {
  width: number | string;
  height: number;
  borderRadius?: number;
}

/**
 * Premium shimmer loading placeholder using looped breathing opacity.
 */
export function SkeletonLoader({ width, height, borderRadius = 8 }: Props) {
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [opacityAnim]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width as any,
          height,
          borderRadius,
          opacity: opacityAnim,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#1A1A1A',
  },
});
