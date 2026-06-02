import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { useMMKVBoolean } from 'react-native-mmkv';
import { AuthStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { storage } from '../store';

type Props = StackScreenProps<AuthStackParamList, 'AdminDashboard'>;

export function AdminDashboardScreen({ navigation }: Props) {
  const [, setIsAdminMode] = useMMKVBoolean('isAdminMode', storage);

  const handleLogout = () => {
    navigation.navigate('Login');
  };

  const handleSwitchToField = () => {
    setIsAdminMode(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Admin Panel</Text>
          <Text style={styles.subtitle}>OFFLINE CONTROL CENTRE</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>System Synchronization</Text>
          <View style={styles.syncRow}>
            <View>
              <Text style={styles.metricLabel}>Last Sync Time</Text>
              <Text style={styles.metricValue}>2026-06-02 20:30 (10m ago)</Text>
            </View>
            <StatusBadge status="synced" />
          </View>
        </View>

        <View style={styles.grid}>
          <View style={[styles.gridItem, styles.mr8]}>
            <Text style={styles.gridLabel}>Enrolled Users</Text>
            <Text style={styles.gridNumber}>1,482</Text>
            <Text style={styles.gridSubtext}>Local database</Text>
          </View>
          <View style={[styles.gridItem, styles.ml8]}>
            <Text style={styles.gridLabel}>Pending Sync</Text>
            <Text style={[styles.gridNumber, styles.pendingColor]}>7</Text>
            <Text style={styles.gridSubtext}>Pending API queue</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Hardware & Partition Info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Device Identifier</Text>
            <Text style={styles.infoVal}>DL-FACE-RN-99</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Partition Zone</Text>
            <Text style={styles.infoVal}>AFRICA-EAST-02</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>TFLite Model Version</Text>
            <Text style={styles.infoVal}>MobileNetV3-Face (v2.4)</Text>
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <Button
            label="Switch to Field Operator Mode"
            onPress={handleSwitchToField}
            style={styles.actionBtn}
          />
          <Button
            label="Log Out of Admin Portal"
            onPress={handleLogout}
            variant="outline"
            style={styles.actionBtn}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    flexGrow: 1,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontFamily: 'System',
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
    color: '#00E5FF',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 1,
  },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontFamily: 'System',
    fontSize: 12,
    color: '#A0A0A0',
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: 'System',
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  gridItem: {
    flex: 1,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 16,
  },
  mr8: {
    marginRight: 8,
  },
  ml8: {
    marginLeft: 8,
  },
  gridLabel: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '600',
    color: '#A0A0A0',
    marginBottom: 8,
  },
  gridNumber: {
    fontFamily: 'System',
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  pendingColor: {
    color: '#FFB300',
  },
  gridSubtext: {
    fontFamily: 'System',
    fontSize: 12,
    color: '#666666',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  infoKey: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#A0A0A0',
  },
  infoVal: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  actionsContainer: {
    marginTop: 16,
  },
  actionBtn: {
    marginVertical: 6,
  },
});
