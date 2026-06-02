import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { User } from '../types';
import { StatusBadge } from './StatusBadge';

interface UserCardProps {
  user: User;
  style?: ViewStyle;
}

export function UserCard({ user, style }: UserCardProps) {
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>{user.role}</Text>
        </View>
        <StatusBadge status={user.syncStatus === 'failed' ? 'failed' : user.syncStatus} />
      </View>

      <View style={styles.footer}>
        <View style={styles.infoCol}>
          <Text style={styles.infoLabel}>Partition</Text>
          <Text style={styles.infoValue}>{user.partition}</Text>
        </View>
        <View style={styles.infoColRight}>
          <Text style={styles.infoLabel}>Last Seen</Text>
          <Text style={styles.infoValue}>{formatDate(user.lastSeen)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    paddingBottom: 12,
    marginBottom: 12,
  },
  name: {
    fontFamily: 'System',
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  role: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#00E5FF',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoCol: {
    flex: 1,
  },
  infoColRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  infoLabel: {
    fontFamily: 'System',
    fontSize: 12,
    color: '#A0A0A0',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});
