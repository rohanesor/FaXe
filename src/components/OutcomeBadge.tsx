import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { VerificationOutcome } from '../types/verification';

interface Props {
  outcome: VerificationOutcome;
}

/**
 * Status indicator badge that highlights verification outcomes.
 * Features a pulsing animation for high-alert items like spoof detection.
 */
export function OutcomeBadge({ outcome }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (outcome === VerificationOutcome.SPOOF_DETECTED) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [outcome, pulseAnim]);

  const getBadgeStyle = () => {
    switch (outcome) {
      case VerificationOutcome.VERIFIED:
        return {
          container: styles.verifiedContainer,
          text: styles.verifiedText,
          label: 'VERIFIED',
          icon: '✓',
        };
      case VerificationOutcome.NOT_RECOGNIZED:
        return {
          container: styles.notRecognizedContainer,
          text: styles.notRecognizedText,
          label: 'NOT RECOGNIZED',
          icon: '✗',
        };
      case VerificationOutcome.SPOOF_DETECTED:
        return {
          container: styles.spoofContainer,
          text: styles.spoofText,
          label: 'SPOOF DETECTED',
          icon: '⚠️',
        };
      case VerificationOutcome.NO_USERS_ENROLLED:
        return {
          container: styles.noUsersContainer,
          text: styles.noUsersText,
          label: 'NO USERS ENROLLED',
          icon: '📭',
        };
      case VerificationOutcome.ERROR:
      default:
        return {
          container: styles.errorContainer,
          text: styles.errorText,
          label: 'VERIFICATION ERROR',
          icon: '🛑',
        };
    }
  };

  const badge = getBadgeStyle();

  if (outcome === VerificationOutcome.SPOOF_DETECTED) {
    return (
      <Animated.View
        style={[
          styles.badgeBase,
          badge.container,
          { transform: [{ scale: pulseAnim }] },
        ]}
      >
        <Text style={[styles.iconText, badge.text]}>{badge.icon}</Text>
        <Text style={[styles.labelText, badge.text]}>{badge.label}</Text>
      </Animated.View>
    );
  }

  return (
    <View style={[styles.badgeBase, badge.container]}>
      <Text style={[styles.iconText, badge.text]}>{badge.icon} </Text>
      <Text style={[styles.labelText, badge.text]}>{badge.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badgeBase: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'center',
    borderWidth: 1,
  },
  iconText: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '800',
    marginRight: 4,
  },
  labelText: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  // VERIFIED: green background, white text
  verifiedContainer: {
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
    borderColor: '#00C853',
  },
  verifiedText: {
    color: '#00C853',
  },
  // NOT_RECOGNIZED: red background, white text
  notRecognizedContainer: {
    backgroundColor: 'rgba(255, 59, 59, 0.15)',
    borderColor: '#FF3B3B',
  },
  notRecognizedText: {
    color: '#FF3B3B',
  },
  // SPOOF_DETECTED: red background, warning icon, pulsing border
  spoofContainer: {
    backgroundColor: 'rgba(255, 59, 59, 0.25)',
    borderColor: '#FF3B3B',
    borderWidth: 1.5,
  },
  spoofText: {
    color: '#FF3B3B',
    fontWeight: '800',
  },
  // NO_USERS_ENROLLED: yellow background, dark text
  noUsersContainer: {
    backgroundColor: 'rgba(255, 214, 0, 0.15)',
    borderColor: '#FFD600',
  },
  noUsersText: {
    color: '#FFD600',
  },
  // ERROR: dark red background, white text
  errorContainer: {
    backgroundColor: 'rgba(211, 47, 47, 0.15)',
    borderColor: '#D32F2F',
  },
  errorText: {
    color: '#D32F2F',
  },
});
