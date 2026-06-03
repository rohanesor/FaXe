import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

interface RolePickerProps {
  value: 'worker' | 'admin' | 'visitor';
  onChange: (value: 'worker' | 'admin' | 'visitor') => void;
}

/**
 * Styled segmented control for picking the user role.
 * Selected options show a solid cyan background with dark text, unselected options are transparent.
 */
export function RolePicker({ value, onChange }: RolePickerProps) {
  const options: Array<{ label: string; id: 'worker' | 'admin' | 'visitor' }> = [
    { label: 'Worker', id: 'worker' },
    { label: 'Admin', id: 'admin' },
    { label: 'Visitor', id: 'visitor' },
  ];

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = value === option.id;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            style={[styles.segment, isSelected && styles.selectedSegment]}
          >
            <Text style={[styles.label, isSelected && styles.selectedLabel]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: '#333333',
    height: 48,
    alignItems: 'stretch',
  },
  segment: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  selectedSegment: {
    backgroundColor: '#00E5FF',
  },
  label: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectedLabel: {
    color: '#0A0A0A',
    fontWeight: '700',
  },
});
