import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { CameraView } from '../components/CameraView';
import { cameraManager } from '../modules/camera/CameraManager';
import { AlignedFaceFrame } from '../types/camera';

type Props = StackScreenProps<MainStackParamList, 'Verify'>;

export function VerifyScreen({ navigation }: Props) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [alignedFrame, setAlignedFrame] = useState<AlignedFaceFrame | null>(null);

  useEffect(() => {
    const initPermissions = async () => {
      const hasPerm = await cameraManager.hasPermission();
      if (!hasPerm) {
        const granted = await cameraManager.requestPermission();
        if (!granted) {
          Alert.alert(
            'Camera Access Required',
            'Please enable camera access in your device settings to execute biometric identity checks.'
          );
        }
      }
    };
    initPermissions();
  }, []);

  const handleFaceAligned = (frameData: AlignedFaceFrame) => {
    console.log('[VerifyScreen] Aligned frame captured:', {
      timestamp: frameData.timestamp,
      width: frameData.width,
      height: frameData.height,
      base64Length: frameData.base64jpeg.length,
    });
    setAlignedFrame(frameData);
    setIsAnalyzing(true);

    // Simulate authenticating vectors offline after successful crop
    setTimeout(() => {
      setIsAnalyzing(false);
      setAlignedFrame(null);
      // Route automatically with verified outcome
      navigation.navigate('Result', {
        result: {
          matched: true,
          userId: 'usr-4129',
          confidence: 0.965,
          livenessScore: 0.941,
          timestamp: new Date().toISOString(),
        },
      });
    }, 1500);
  };

  const handleSimulateMatch = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      navigation.navigate('Result', {
        result: {
          matched: true,
          userId: 'usr-4129',
          confidence: 0.942,
          livenessScore: 0.915,
          timestamp: new Date().toISOString(),
        },
      });
    }, 1200);
  };

  const handleSimulateFailure = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      navigation.navigate('Result', {
        result: {
          matched: false,
          confidence: 0.314,
          livenessScore: 0.887,
          timestamp: new Date().toISOString(),
        },
      });
    }, 1200);
  };

  const handleSimulateSpoof = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      navigation.navigate('Result', {
        result: {
          matched: false,
          confidence: 0.895,
          livenessScore: 0.082,
          timestamp: new Date().toISOString(),
        },
      });
    }, 1200);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Identity Verification</Text>
          <Text style={styles.subtitle}>OFFLINE BIOMETRIC ANALYSIS</Text>
        </View>

        {/* Live Camera Biometric Scanner View */}
        <View style={styles.cameraContainer}>
          <CameraView onFaceAligned={handleFaceAligned} isActive={!isAnalyzing && !alignedFrame} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>Developer Test Simulation</Text>
          <Text style={styles.cardDescription}>
            In addition to letting the camera overlay align automatically, use these presets to manually simulate biometric outcomes.
          </Text>

          <Button
            label="Simulate Verified Match"
            onPress={handleSimulateMatch}
            disabled={isAnalyzing}
            variant="success"
            style={styles.simBtn}
          />

          <Button
            label="Simulate Identity Mismatch"
            onPress={handleSimulateFailure}
            disabled={isAnalyzing}
            variant="danger"
            style={styles.simBtn}
          />

          <Button
            label="Simulate Liveness Spoof Attack"
            onPress={handleSimulateSpoof}
            disabled={isAnalyzing}
            variant="outline"
            style={[styles.simBtn, styles.spoofOutlineBtn]}
          />
        </View>

        <Button
          label="Cancel Verification"
          onPress={() => navigation.goBack()}
          disabled={isAnalyzing}
          style={styles.cancelBtn}
        />
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
    marginBottom: 20,
  },
  cardHeader: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 1,
  },
  cardDescription: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#666666',
    lineHeight: 18,
    marginBottom: 16,
  },
  simBtn: {
    marginVertical: 6,
    height: 46,
  },
  spoofOutlineBtn: {
    borderColor: '#FF3B3B',
  },
  cancelBtn: {
    marginTop: 'auto',
  },
});
