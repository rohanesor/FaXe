import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';

type Props = StackScreenProps<MainStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Field Operations</Text>
            <Text style={styles.subtitle}>OFFLINE IDENTITY VERIFICATION</Text>
          </View>
          <Pressable
            style={styles.settingsCog}
            onPress={() => navigation.navigate('Settings')}
          >
            <Text style={styles.cogText}>Settings</Text>
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Offline Status: Operational</Text>
          <Text style={styles.heroText}>
            Local face embeddings cache is up to date. Direct biometrics enrolment and recognition can be executed securely off-grid.
          </Text>
        </View>

        <View style={styles.actionsContainer}>
          <Text style={styles.sectionTitle}>Verification Actions</Text>
          
          <Button
            label="Enroll New User"
            onPress={() => navigation.navigate('Enroll')}
            style={styles.actionBtn}
          />

          <Button
            label="Verify Identity"
            onPress={() => navigation.navigate('Verify')}
            variant="outline"
            style={styles.actionBtn}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Secure offline database: AFR-E-02</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
  settingsCog: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cogText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  heroCard: {
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
    borderRadius: 16,
    padding: 20,
    marginVertical: 20,
  },
  heroTitle: {
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '700',
    color: '#00E5FF',
    marginBottom: 8,
  },
  heroText: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#A0A0A0',
    lineHeight: 20,
  },
  actionsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    marginBottom: 16,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  actionBtn: {
    marginVertical: 10,
    height: 56,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontFamily: 'System',
    fontSize: 12,
    color: '#666666',
  },
});
