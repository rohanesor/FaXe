import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { Camera, useCameraDevice, useObjectOutput, isScannedCode } from 'react-native-vision-camera';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { deviceProvisioner, ProvisioningData } from '../modules/sync/DeviceProvisioner';
import { Toast } from '../components/Toast';
import { Logger } from '../utils/logger';
import { cameraManager } from '../modules/camera/CameraManager';

type Props = StackScreenProps<MainStackParamList, 'Provisioning'>;

/**
 * Screen displayed on first launch if the device is not provisioned.
 * Collects cloud base URLs and authorization keys via forms or QR scans.
 */
interface QRScannerProps {
  onCodeScanned: (data: string) => void;
  onCancel: () => void;
}

function QRScanner({ onCodeScanned, onCancel }: QRScannerProps) {
  const device = useCameraDevice('back');
  const [hasCameraPermission, setHasCameraPermission] = useState(false);

  useEffect(() => {
    const checkPermission = async () => {
      const granted = await cameraManager.hasPermission();
      if (granted) {
        setHasCameraPermission(true);
      } else {
        const requestResult = await cameraManager.requestPermission();
        setHasCameraPermission(requestResult);
        if (!requestResult) {
          Toast.show({
            message: 'Camera permission is required to scan QR codes.',
            type: 'error',
          });
          onCancel();
        }
      }
    };
    checkPermission();
  }, [onCancel]);

  const objectOutput = useObjectOutput({
    types: ['qr'],
    onObjectsScanned: (objects) => {
      if (objects.length > 0) {
        const obj = objects[0];
        if (isScannedCode(obj) && obj.value) {
          onCodeScanned(obj.value);
        }
      }
    },
  });

  if (!hasCameraPermission) {
    return (
      <View style={[styles.scannerContainer, styles.scannerPlaceholder]}>
        <Text style={styles.placeholderText}>Requesting camera permission...</Text>
        <Button
          label="Cancel Scan"
          onPress={onCancel}
          variant="outline"
          style={styles.cancelScanBtn}
        />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.scannerContainer, styles.scannerPlaceholder]}>
        <Text style={styles.placeholderText}>No camera device available</Text>
        <Button
          label="Cancel Scan"
          onPress={onCancel}
          variant="outline"
          style={styles.cancelScanBtn}
        />
      </View>
    );
  }

  return (
    <View style={styles.scannerContainer}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        outputs={[objectOutput]}
      />
      <View style={styles.scannerHeader}>
        <Text style={styles.scannerTitle}>Scan Provisioning QR Code</Text>
        <Text style={styles.scannerSubtitle}>Position the QR code inside the frame</Text>
      </View>
      <View style={styles.scannerTargetFrame} />
      <Button
        label="Cancel Scan"
        onPress={onCancel}
        variant="outline"
        style={styles.cancelScanBtn}
      />
    </View>
  );
}

/**
 * Screen displayed on first launch if the device is not provisioned.
 * Collects cloud base URLs and authorization keys via forms or QR scans.
 */
export function ProvisioningScreen({ navigation }: Props) {
  const [awsBaseUrl, setAwsBaseUrl] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [deviceSecret, setDeviceSecret] = useState('');
  const [partition, setPartition] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const handleSave = () => {
    if (!awsBaseUrl.trim() || !deviceId.trim() || !deviceSecret.trim() || !partition.trim()) {
      Toast.show({
        message: 'All provisioning fields are mandatory.',
        type: 'error',
      });
      return;
    }

    try {
      deviceProvisioner.provision({
        awsBaseUrl: awsBaseUrl.trim(),
        deviceId: deviceId.trim(),
        deviceSecret: deviceSecret.trim(),
        partition: partition.trim(),
      });

      Toast.show({
        message: 'Device provisioning complete. Welcome!',
        type: 'success',
      });

      // Clear navigation stack and load Home
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } catch (err) {
      Logger.error('ProvisioningScreen', 'Device setup save failed', err);
      Toast.show({
        message: 'Failed to write secure configuration parameters.',
        type: 'error',
      });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        {isScanning && Platform.OS !== 'android' ? (
          <QRScanner
            onCancel={() => setIsScanning(false)}
            onCodeScanned={(dataString) => {
              try {
                Logger.info('ProvisioningScreen', `QR Code scanned: ${dataString}`);
                const parsed: ProvisioningData = JSON.parse(dataString);

                if (parsed.awsBaseUrl && parsed.deviceId && parsed.deviceSecret && parsed.partition) {
                  setAwsBaseUrl(parsed.awsBaseUrl);
                  setDeviceId(parsed.deviceId);
                  setDeviceSecret(parsed.deviceSecret);
                  setPartition(parsed.partition);
                  
                  setIsScanning(false);
                  
                  Toast.show({
                    message: 'QR Code parsed successfully. Credentials loaded.',
                    type: 'success',
                  });
                } else {
                  Toast.show({
                    message: 'QR Code JSON is missing required fields.',
                    type: 'error',
                  });
                }
              } catch (err) {
                Logger.error('ProvisioningScreen', 'Failed to parse QR code JSON', err);
                Toast.show({
                  message: 'Invalid QR Code format. Please scan a valid provisioning JSON.',
                  type: 'error',
                });
              }
            }}
          />
        ) : (
          // Manual Provisioning Form View
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Device Setup</Text>
              <Text style={styles.subtitle}>OFFLINE SYSTEM PROVISIONING</Text>
            </View>

            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsText}>
                Provision this terminal for offline operation. You can fill out credentials manually or scan the administrator configuration QR code.
              </Text>
              <Button
                label="Scan Configuration QR"
                onPress={() => {
                  if (Platform.OS === 'android') {
                    Toast.show({
                      message: 'QR Code scanning is only supported on iOS. Please enter credentials manually.',
                      type: 'info',
                    });
                    return;
                  }
                  setIsScanning(true);
                }}
                variant="outline"
                style={styles.scanBtn}
              />
            </View>


            <View style={styles.formCard}>
              <Text style={styles.formHeader}>Configuration Credentials</Text>
              
              <Text style={styles.fieldLabel}>AWS Base URL</Text>
              <TextInput
                style={styles.input}
                placeholder="https://api.yourcloud.com/v1"
                placeholderTextColor="#444"
                value={awsBaseUrl}
                onChangeText={setAwsBaseUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.fieldLabel}>Device ID</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. DEV-RJ-001"
                placeholderTextColor="#444"
                value={deviceId}
                onChangeText={setDeviceId}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.fieldLabel}>Device Secret</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••••••••••"
                placeholderTextColor="#444"
                secureTextEntry={true}
                value={deviceSecret}
                onChangeText={setDeviceSecret}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.fieldLabel}>Partition Zone Code</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. RAJASTHAN-ZONE-3"
                placeholderTextColor="#444"
                value={partition}
                onChangeText={setPartition}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            <Button
              label="Save and Continue"
              onPress={handleSave}
              style={styles.saveBtn}
            />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    flexGrow: 1,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontFamily: 'System',
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
    color: '#00E5FF',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  instructionsCard: {
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.15)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  instructionsText: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#A0A0A0',
    lineHeight: 18,
    marginBottom: 16,
  },
  scanBtn: {
    height: 40,
    borderColor: '#00E5FF',
  },
  formCard: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
  },
  formHeader: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '700',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 20,
  },
  fieldLabel: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
    color: '#888888',
    marginBottom: 6,
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
    fontSize: 14,
    marginBottom: 16,
  },
  saveBtn: {
    height: 52,
    marginTop: 'auto',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
    padding: 24,
  },
  scannerHeader: {
    alignItems: 'center',
    marginTop: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignSelf: 'center',
  },
  scannerTitle: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: '800',
  },
  scannerSubtitle: {
    color: '#A0A0A0',
    fontFamily: 'System',
    fontSize: 12,
    marginTop: 4,
  },
  scannerTargetFrame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: '#00E5FF',
    borderRadius: 16,
    alignSelf: 'center',
    backgroundColor: 'transparent',
  },
  cancelScanBtn: {
    marginBottom: 20,
    height: 50,
  },
  scannerPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#FFFFFF',
    marginBottom: 20,
  },
});
