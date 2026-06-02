import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { CameraView } from '../components/CameraView';
import { cameraManager } from '../modules/camera/CameraManager';
import { AlignedFaceFrame } from '../types/camera';

type Props = StackScreenProps<MainStackParamList, 'Enroll'>;

export function EnrollScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('Operator');
  const [partition, setPartition] = useState('AFR-E-02');
  const [isCapturing, setIsCapturing] = useState(false);
  const [alignedFrame, setAlignedFrame] = useState<AlignedFaceFrame | null>(null);

  useEffect(() => {
    const initPermissions = async () => {
      const hasPerm = await cameraManager.hasPermission();
      if (!hasPerm) {
        const granted = await cameraManager.requestPermission();
        if (!granted) {
          Alert.alert(
            'Camera Access Required',
            'Please enable camera access in your device settings to use biometric enrollment.'
          );
        }
      }
    };
    initPermissions();
  }, []);

  const handleFaceAligned = (frameData: AlignedFaceFrame) => {
    console.log('[EnrollScreen] Received AlignedFaceFrame:', {
      timestamp: frameData.timestamp,
      width: frameData.width,
      height: frameData.height,
      base64Length: frameData.base64jpeg.length,
    });
    setAlignedFrame(frameData);
    Alert.alert(
      'Face Aligned',
      'Biometric parameters successfully extracted! Please fill in details and tap Enroll.'
    );
  };

  const handleEnroll = () => {
    setIsCapturing(true);
    setTimeout(() => {
      setIsCapturing(false);
      Alert.alert('Success', `User ${name || 'Demo User'} successfully enrolled locally!`);
      navigation.goBack();
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Biometric Enrollment</Text>
            <Text style={styles.subtitle}>CREATE OFFLINE PROFILE</Text>
          </View>

          {/* Interactive Biometric CameraView */}
          <View style={styles.cameraContainer}>
            <CameraView onFaceAligned={handleFaceAligned} isActive={!alignedFrame && !isCapturing} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHeader}>User Profile Metadata</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter full name"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Role</Text>
              <TextInput
                style={styles.input}
                value={role}
                onChangeText={setRole}
                placeholder="Enter role (e.g., Driver, Guard)"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Partition Code</Text>
              <TextInput
                style={styles.input}
                value={partition}
                onChangeText={setPartition}
                placeholder="AFR-E-02"
                placeholderTextColor="#666"
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Button
              label={isCapturing ? "Processing..." : "Capture & Enroll User"}
              onPress={handleEnroll}
              disabled={!name || isCapturing || !alignedFrame}
              style={styles.actionBtn}
            />
            <Button
              label="Cancel"
              onPress={() => navigation.goBack()}
              variant="outline"
              disabled={isCapturing}
              style={styles.actionBtn}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    flexGrow: 1,
  },
  header: {
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
  cameraContainer: {
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222222',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  cardHeader: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    marginBottom: 16,
    letterSpacing: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#A0A0A0',
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    height: 48,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 16,
  },
  actions: {
    marginTop: 'auto',
  },
  actionBtn: {
    marginVertical: 6,
  },
});
