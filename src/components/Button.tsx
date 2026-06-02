import React from 'react';
import { Pressable, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'success' | 'outline';
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, disabled = false, variant = 'primary', style }: ButtonProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          button: [styles.buttonDanger, disabled && styles.buttonDisabled],
          text: styles.textWhite,
        };
      case 'success':
        return {
          button: [styles.buttonSuccess, disabled && styles.buttonDisabled],
          text: styles.textWhite,
        };
      case 'outline':
        return {
          button: [styles.buttonOutline, disabled && styles.buttonDisabled],
          text: styles.textAccent,
        };
      case 'primary':
      default:
        return {
          button: [styles.buttonPrimary, disabled && styles.buttonDisabled],
          text: styles.textDark,
        };
    }
  };

  const { button: variantBtnStyle, text: variantTextStyle } = getVariantStyles();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.buttonBase,
        ...variantBtnStyle,
        style,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.textBase, variantTextStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttonBase: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPrimary: {
    backgroundColor: '#00E5FF',
  },
  buttonDanger: {
    backgroundColor: '#FF3B3B',
  },
  buttonSuccess: {
    backgroundColor: '#00C853',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#00E5FF',
  },
  textBase: {
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '600',
  },
  textDark: {
    color: '#0A0A0A',
  },
  textWhite: {
    color: '#FFFFFF',
  },
  textAccent: {
    color: '#00E5FF',
  },
});
