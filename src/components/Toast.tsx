import React, { useState, useImperativeHandle, forwardRef, useRef, useCallback } from 'react';
import { Text, StyleSheet, Animated, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface ToastConfig {
  message: string;
  type: 'success' | 'error' | 'info';
  durationMs?: number;
}

let toastRef: any = null;

/**
 * Global singleton reference for display triggers.
 */
export const Toast = {
  show: (config: ToastConfig) => {
    if (toastRef) {
      toastRef.show(config);
    }
  },
  hide: () => {
    if (toastRef) {
      toastRef.hide();
    }
  },
};

/**
 * ToastContainer renders at the absolute root of the App tree.
 * Intercepts show commands and executes spring slide-down overlays.
 * 
 * Queue policy: max 2 total (1 showing + 1 queued).
 * If a 3rd toast arrives while the queue is full, the oldest queued toast is dropped.
 */
export const ToastContainer = forwardRef((_props, ref) => {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<ToastConfig | null>(null);

  const slideAnim = useRef(new Animated.Value(-150)).current;
  const timeoutRef = useRef<any>(null);
  const queueRef = useRef<ToastConfig[]>([]);
  const isShowingRef = useRef(false);

  const showNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      isShowingRef.current = false;
      return;
    }

    const nextConfig = queueRef.current.shift()!;
    isShowingRef.current = true;

    setConfig(nextConfig);
    setVisible(true);

    // Slide in spring animation
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 40,
      friction: 8,
      useNativeDriver: true,
    }).start();

    const duration = nextConfig.durationMs || 3000;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      hideAndAdvance();
    }, duration);
  }, [slideAnim]);

  const hideAndAdvance = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    Animated.timing(slideAnim, {
      toValue: -150,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      setConfig(null);
      // Show next queued toast if any
      showNext();
    });
  }, [slideAnim, showNext]);

  const hide = useCallback(() => {
    hideAndAdvance();
  }, [hideAndAdvance]);

  useImperativeHandle(ref, () => ({
    show: (newConfig: ToastConfig) => {
      // Queue policy: max 2 total (1 showing + 1 queued)
      if (isShowingRef.current) {
        // If the queue already has 1 item, drop the oldest to make room
        if (queueRef.current.length >= 1) {
          queueRef.current.shift();
        }
        queueRef.current.push(newConfig);
      } else {
        // Nothing showing — show immediately
        queueRef.current.push(newConfig);
        showNext();
      }
    },
    hide,
  }));

  if (!visible || !config) {
    return null;
  }

  const getStyleByType = () => {
    switch (config.type) {
      case 'success':
        return { bg: '#00C853', icon: '✓' }; // Premium Green
      case 'error':
        return { bg: '#FF3B3B', icon: '✕' }; // Red
      case 'info':
      default:
        return { bg: '#222222', icon: 'ℹ' }; // Dark Grey
    }
  };

  const styleInfo = getStyleByType();

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          transform: [{ translateY: slideAnim }],
          backgroundColor: styleInfo.bg,
        },
      ]}
    >
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <Pressable onPress={hide} style={styles.toastContent}>
          <Text style={styles.icon}>{styleInfo.icon}</Text>
          <Text style={styles.message}>{config.message}</Text>
        </Pressable>
      </SafeAreaView>
    </Animated.View>
  );
});

// Statically hook the container ref
export function setGlobalToastRef(ref: any) {
  toastRef = ref;
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999, // Overlay absolute top
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 10,
  },
  safeArea: {
    width: '100%',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  icon: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: '800',
    marginRight: 12,
  },
  message: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
});
