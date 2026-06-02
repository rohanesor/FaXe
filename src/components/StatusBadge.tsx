import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'failed';

interface StatusBadgeProps {
  status: SyncStatus;
  style?: ViewStyle;
}

export function StatusBadge({ status, style }: StatusBadgeProps) {
  const getBadgeConfig = () => {
    switch (status) {
      case 'synced':
        return {
          backgroundColor: 'rgba(0, 200, 83, 0.15)',
          borderColor: '#00C853',
          textColor: '#00C853',
          label: 'Synced',
        };
      case 'pending':
        return {
          backgroundColor: 'rgba(255, 179, 0, 0.15)',
          borderColor: '#FFB300',
          textColor: '#FFB300',
          label: 'Pending',
        };
      case 'conflict':
        return {
          backgroundColor: 'rgba(255, 59, 59, 0.15)',
          borderColor: '#FF3B3B',
          textColor: '#FF3B3B',
          label: 'Conflict',
        };
      case 'failed':
      default:
        return {
          backgroundColor: 'rgba(255, 59, 59, 0.15)',
          borderColor: '#FF3B3B',
          textColor: '#FF3B3B',
          label: 'Failed',
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
        },
        style,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: config.textColor }]} />
      <Text style={[styles.text, { color: config.textColor }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});
