import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { CameraView } from '../components/CameraView';
import { StepIndicator } from '../components/StepIndicator';
import { RolePicker } from '../components/RolePicker';
import { AlignedFaceFrame } from '../types/camera';
import { EnrollmentState, EnrollmentResult } from '../types/enrollment';
import { enrollmentService } from '../modules/enrollment/EnrollmentService';
import { enrollmentRepository } from '../modules/database/EnrollmentRepository';
import { wipeStoredEmbeddings } from '../modules/database/UserRepository';
import { FaceEmbeddingService } from '../modules/recognition/FaceEmbeddingService';
import { FaceMatcher } from '../modules/recognition/FaceMatcher';
import { SmartFrameSelector } from '../modules/recognition/SmartFrameSelector';
import { generateUUID } from '../utils/uuid';
import { databaseManager } from '../modules/database/DatabaseManager';
import { deviceProvisioner } from '../modules/sync/DeviceProvisioner';
import { checkDuplicateName, checkDuplicateEmployeeId, updateEmbedding } from '../database/Database';
import { cameraManager } from '../modules/camera/CameraManager';

type Props = StackScreenProps<MainStackParamList, 'Enroll'>;

export function EnrollScreen({ navigation }: Props) {
  // UI states
  const [state, setState] = useState<EnrollmentState>('form');
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState<'worker' | 'admin' | 'visitor'>('worker');
  const [partition, setPartition] = useState('AFR-E-02');
  const [, setAlignedFrame] = useState<AlignedFaceFrame | null>(null);

  const [livenessError, setLivenessError] = useState<string | null>(null);

  // Scan progress and state machine
  const [scanProgress, setScanProgress] = useState(0);
  const [isScanActive, setIsScanActive] = useState(true);
  const [poseSuccessMessage, setPoseSuccessMessage] = useState<string | null>(null);

  // Enrollment process state
  const [enrollmentResult, setEnrollmentResult] = useState<EnrollmentResult | null>(null);
  const [overwriteMode, setOverwriteMode] = useState(false);

  // Smart frame selector
  const frameSelector = useRef(new SmartFrameSelector()).current;
  const startTimeRef = useRef<number | null>(null);
  const duplicateCheckDone = useRef(false);
  const isEnrollingRef = useRef(false);

  // Real-time debounced checks
  const [nameWarning, setNameWarning] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [employeeIdWarning, setEmployeeIdWarning] = useState<string | null>(null);
  const [employeeIdSuccess, setEmployeeIdSuccess] = useState<string | null>(null);
  const [isNameChecking, setIsNameChecking] = useState(false);
  const [isEmployeeIdChecking, setIsEmployeeIdChecking] = useState(false);

  const nameDebounceTimer = useRef<any>(null);
  const empDebounceTimer = useRef<any>(null);

  // Scale animation for success checkmark or error X
  const badgeScale = useRef(new Animated.Value(0)).current;

  // Request camera permission on mount
  useEffect(() => {
    const initPermissions = async () => {
      const hasPerm = await cameraManager.hasPermission();
      if (!hasPerm) {
        const granted = await cameraManager.requestPermission();
        if (!granted) {
          Alert.alert(
            'Camera Access Required',
            'Please enable camera access in settings to enroll operators.'
          );
          navigation.goBack();
        }
      }
    };
    initPermissions();
  }, [navigation]);

  // Load partition code on mount
  useEffect(() => {
    const cachedPartition = deviceProvisioner.getProvisioningData().partition;
    if (cachedPartition) {
      setPartition(cachedPartition);
    }
  }, []);

  // Debounced Name Check
  useEffect(() => {
    if (nameDebounceTimer.current) {
      clearTimeout(nameDebounceTimer.current);
    }

    const trimmed = name.trim();
    if (!trimmed) {
      setNameWarning(null);
      setNameSuccess(null);
      return;
    }

    if (trimmed.length < 2) {
      setNameWarning('Name must be at least 2 characters');
      setNameSuccess(null);
      return;
    }

    if (trimmed.length > 50) {
      setNameWarning('Name cannot exceed 50 characters');
      setNameSuccess(null);
      return;
    }

    const nameRegex = /^[a-zA-Z\s-]+$/;
    if (!nameRegex.test(trimmed)) {
      setNameWarning('Name can only contain letters, spaces, and hyphens');
      setNameSuccess(null);
      return;
    }

    setNameWarning(null);
    setNameSuccess(null);
    setIsNameChecking(true);

    nameDebounceTimer.current = setTimeout(async () => {
      try {
        const isDuplicate = await checkDuplicateName(trimmed);
        if (isDuplicate) {
          setNameWarning(`⚠ '${trimmed}' is already enrolled`);
          setNameSuccess(null);
        } else {
          setNameWarning(null);
          setNameSuccess('✓ Name available');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsNameChecking(false);
      }
    }, 500);

    return () => {
      if (nameDebounceTimer.current) {
        clearTimeout(nameDebounceTimer.current);
      }
    };
  }, [name]);

  // Debounced Employee ID Check
  useEffect(() => {
    if (empDebounceTimer.current) {
      clearTimeout(empDebounceTimer.current);
    }

    const trimmed = employeeId.trim();
    if (!trimmed) {
      setEmployeeIdWarning(null);
      setEmployeeIdSuccess(null);
      return;
    }

    setEmployeeIdWarning(null);
    setEmployeeIdSuccess(null);
    setIsEmployeeIdChecking(true);

    empDebounceTimer.current = setTimeout(async () => {
      try {
        const isDuplicate = await checkDuplicateEmployeeId(trimmed);
        if (isDuplicate) {
          setEmployeeIdWarning('Employee ID already in use');
          setEmployeeIdSuccess(null);
        } else {
          setEmployeeIdWarning(null);
          setEmployeeIdSuccess('✓ Employee ID available');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsEmployeeIdChecking(false);
      }
    }, 500);

    return () => {
      if (empDebounceTimer.current) {
        clearTimeout(empDebounceTimer.current);
      }
    };
  }, [employeeId]);

  // Trigger scale animation on success/error screens, auto-navigate on success after 4s
  useEffect(() => {
    let timeoutId: any;
    if (state === 'success' || state === 'error') {
      badgeScale.setValue(0);
      Animated.spring(badgeScale, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }).start();

      if (state === 'success') {
        timeoutId = setTimeout(() => {
          navigation.navigate('Home' as any);
        }, 4000);
      }
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [state, badgeScale, navigation]);

  const handleFaceAligned = async (frameData: AlignedFaceFrame, yaw: number, pitch: number, blurScore?: number) => {
    if (!isScanActive || isEnrollingRef.current) return;

    // Start timer on first face detection
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
      console.log('[EnrollScreen] Face detected. Starting 3.5s automated scan...');
    }

    // 1. Run Duplicate Face Check on the first frame to fail fast if they are already registered
    if (!duplicateCheckDone.current && !overwriteMode) {
      duplicateCheckDone.current = true;
      console.log('[EnrollScreen] Checking duplicate face on initial frame...');
      const existingEmbeddings = await enrollmentRepository.getCandidates(partition);
      try {
        if (existingEmbeddings.length > 0) {
          const firstEmbedding = await FaceEmbeddingService.generateEmbedding(frameData.base64jpeg);
          const matchResult = FaceMatcher.match(firstEmbedding, existingEmbeddings);
          console.log('[EnrollScreen] Initial frame duplicate scan outcome:', matchResult);
          
          if (matchResult.matched && matchResult.confidence > 0.90) {
            setLivenessError('This face is already enrolled under a profile in this partition.');
            setIsScanActive(false);
            setAlignedFrame(null);
            wipeStoredEmbeddings(existingEmbeddings);
            return;
          }
        }
      } catch (err) {
        console.error('[EnrollScreen] Duplicate check error:', err);
      } finally {
        wipeStoredEmbeddings(existingEmbeddings);
      }
    }

    // 2. Add frame to Smart Frame Selector
    frameSelector.addFrame({
      base64jpeg: frameData.base64jpeg,
      blurScore: blurScore ?? 100,
      yaw,
      pitch,
      timestamp: Date.now(),
    });

    // 3. Update scan progress based on elapsed time (up to 3.5 seconds)
    const elapsed = Date.now() - startTimeRef.current;
    const progress = Math.min(100, Math.round((elapsed / 3500) * 100));
    setScanProgress(progress);

    // 4. Complete scan when time is up (3.5s) or we have all 5 head orientations
    if (elapsed >= 3500 || frameSelector.getUniqueBinCount() === 5) {
      console.log('[EnrollScreen] Frame selection complete. Finalizing template aggregation...');
      setIsScanActive(false);
      isEnrollingRef.current = true;
      setPoseSuccessMessage('Processing scans...');

      // Retrieve best 5 frames representing natural head variations
      const bestFrames = frameSelector.getBestFrames();
      
      // Execute template generation
      setTimeout(() => {
        setPoseSuccessMessage(null);
        aggregateAndEnroll(bestFrames);
      }, 1000);
    }
  };

  const handleContinueToCamera = async () => {
    try {
      setIsNameChecking(true);
      const isEmpDuplicate = await checkDuplicateEmployeeId(employeeId);
      if (isEmpDuplicate) {
        setIsNameChecking(false);
        Alert.alert('Error', 'Employee ID already in use');
        return;
      }

      const isNameDuplicate = await checkDuplicateName(name);
      setIsNameChecking(false);

      if (isNameDuplicate) {
        Alert.alert(
          'Already Enrolled',
          `A person named '${name.trim()}' is already registered. Do you want to UPDATE their biometric data instead?`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {},
            },
            {
              text: 'Update Existing',
              onPress: () => {
                setOverwriteMode(true);
                startTimeRef.current = null;
                duplicateCheckDone.current = false;
                isEnrollingRef.current = false;
                setScanProgress(0);
                setIsScanActive(true);
                frameSelector.reset();
                setLivenessError(null);
                setPoseSuccessMessage(null);
                setState('camera');
              },
            },
          ]
        );
      } else {
        setOverwriteMode(false);
        startTimeRef.current = null;
        duplicateCheckDone.current = false;
        isEnrollingRef.current = false;
        setScanProgress(0);
        setIsScanActive(true);
        frameSelector.reset();
        setLivenessError(null);
        setPoseSuccessMessage(null);
        setState('camera');
      }
    } catch (err) {
      setIsNameChecking(false);
      console.error(err);
    }
  };

  const aggregateAndEnroll = async (frames: { base64jpeg: string }[]) => {
    setState('processing');
    try {
      if (frames.length === 0) {
        throw new Error('NO_VALID_FRAMES: Could not extract any sharp face scans.');
      }

      // Generate embeddings for the selected best frames
      const embeddings: Float32Array[] = [];
      for (const f of frames) {
        const emb = await FaceEmbeddingService.generateEmbedding(f.base64jpeg);
        embeddings.push(emb);
      }

      // Aggregate (average) the embeddings to create a single robust template
      // Apply 50% weight to the Front pose (index 0) and split the remaining 50% among profile poses
      console.log('[EnrollScreen] Calculating weighted average biometric vector...');
      const dim = embeddings[0]?.length || 192;
      const avgEmbedding = new Float32Array(dim);
      const numPoses = embeddings.length;

      const weights = new Float32Array(numPoses);
      if (numPoses > 1) {
        weights[0] = 0.50; // Front pose gets 50% weight
        const remainingWeight = 0.50 / (numPoses - 1);
        for (let p = 1; p < numPoses; p++) {
          weights[p] = remainingWeight;
        }
      } else {
        weights[0] = 1.0;
      }

      for (let d = 0; d < dim; d++) {
        let sum = 0;
        for (let p = 0; p < numPoses; p++) {
          sum += embeddings[p][d] * weights[p];
        }
        avgEmbedding[d] = sum;
      }

      // L2 Normalize the averaged template
      let sumSquares = 0;
      for (let i = 0; i < dim; i++) {
        sumSquares += avgEmbedding[i] * avgEmbedding[i];
      }
      const magnitude = Math.sqrt(sumSquares);
      if (magnitude > 0) {
        for (let i = 0; i < dim; i++) {
          avgEmbedding[i] /= magnitude;
        }
      }

      const targetUserId = employeeId.trim() || generateUUID();
      const payload = {
        id: targetUserId,
        name: name.trim(),
        role: role,
        partition: partition,
      };

      if (overwriteMode) {
        console.log('[EnrollScreen] Overwriting template in database...');
        await updateEmbedding(name, avgEmbedding);
      } else {
        console.log('[EnrollScreen] Registering new template in database...');
        // Directly enroll the pre-calculated, weighted-averaged template
        // This avoids running double inference by not calling enrollmentService.enrollMultiPose
        await enrollmentRepository.enrollUser(payload, avgEmbedding);
      }

      setEnrollmentResult({
        success: true,
        userId: targetUserId,
        name: name.trim(),
        enrolledAt: Date.now(),
        reason: null,
        step: null,
      });
      
      try {
        databaseManager.runDiagnostic();
      } catch (diagErr) {
        console.warn('[EnrollScreen] Post-enrollment diagnostic failed:', diagErr);
      }
      setState('success');
    } catch (err: any) {
      console.error('[EnrollScreen] Enrollment pipeline crashed:', err);
      setEnrollmentResult({
        success: false,
        userId: null,
        name: null,
        enrolledAt: null,
        reason: 'SYSTEM_ERROR',
        step: 5,
      });
      setState('error');
    }
  };

  const getStepIndex = (): number => {
    switch (state) {
      case 'form':
        return 0;
      case 'camera':
      case 'liveness':
        return 1;
      case 'processing':
      case 'success':
      case 'error':
        return 2;
      default:
        return 0;
    }
  };

  const handleCancelCamera = () => {
    setIsScanActive(false);
    setState('form');
    setAlignedFrame(null);
    setScanProgress(0);
    setLivenessError(null);
  };

  const resetFlow = () => {
    setName('');
    setEmployeeId('');
    setRole('worker');
    setAlignedFrame(null);
    setEnrollmentResult(null);
    setOverwriteMode(false);
    setNameWarning(null);
    setNameSuccess(null);
    setEmployeeIdWarning(null);
    setEmployeeIdSuccess(null);
    setScanProgress(0);
    setLivenessError(null);
    setState('form');
  };

  const retryFromState = () => {
    setAlignedFrame(null);
    setScanProgress(0);
    setLivenessError(null);
    if (!enrollmentResult) {
      setState('form');
      return;
    }
    
    if (enrollmentResult.reason === 'INVALID_INPUT') {
      setState('form');
    } else {
      setIsScanActive(true);
      startTimeRef.current = null;
      duplicateCheckDone.current = false;
      isEnrollingRef.current = false;
      frameSelector.reset();
      setState('camera');
    }
  };

  const getErrorMessage = (): string => {
    if (!enrollmentResult) return 'Enrollment failed. Please try again';
    switch (enrollmentResult.reason) {
      case 'DUPLICATE_FACE':
        return 'This face is already enrolled in this partition';
      case 'INVALID_INPUT':
        return 'Please check the form and try again';
      case 'INFERENCE_FAILED':
        return 'Face scan failed. Please try again in better lighting';
      default:
        return 'Enrollment failed. Please try again';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {state !== 'camera' && state !== 'liveness' && (
          <StepIndicator currentStep={getStepIndex()} />
        )}

        {state === 'camera' ? (
          <View style={StyleSheet.absoluteFill}>
            <CameraView
              onFaceAligned={handleFaceAligned}
              isActive={isScanActive}
              isEnrollment={true}
            />
            
            <View style={styles.cameraOverlayHeader}>
              <Pressable onPress={handleCancelCamera} style={styles.cancelLink}>
                <Text style={styles.cancelLinkText}>✕ Cancel</Text>
              </Pressable>
              <Text style={styles.cameraTitle}>Face ID Setup</Text>
            </View>

            {/* Premium Circular Scan Progress */}
            <View style={styles.progressOverlay}>
              <Text style={styles.progressTitle}>Position Face inside the Scanner</Text>
              <Text style={styles.progressSubtitle}>Slowly look straight and rotate your head slightly</Text>
              
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarFill, { width: `${scanProgress}%` }]} />
              </View>
              <Text style={styles.progressPercentage}>{scanProgress}% Complete</Text>
            </View>

            {poseSuccessMessage && (
              <View style={[styles.poseLoadingOverlay, styles.poseSuccessOverlay]}>
                <View style={styles.poseSuccessIconCircle}>
                  <ActivityIndicator size="large" color="#00C853" />
                </View>
                <Text style={styles.poseSuccessText}>{poseSuccessMessage}</Text>
              </View>
            )}
            
            {livenessError && (
              <View style={styles.errorBanner}>
                <Text style={styles.livenessWarning}>{livenessError}</Text>
                <Button label="Retry Scan" onPress={retryFromState} variant="danger" style={styles.retryBtn} />
              </View>
            )}
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
            
            {/* STATE: FORM */}
            {state === 'form' && (
              <View style={styles.stepContainer}>
                <View style={styles.header}>
                  <Text style={styles.title}>Operator Details</Text>
                  <Text style={styles.subtitle}>CREATE SECURE OFFLINE PROFILE</Text>
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardHeader}>Identity Attributes</Text>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Full Name</Text>
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                      onBlur={() => setName(name.trim())}
                      placeholder="Enter operator name"
                      placeholderTextColor="#666666"
                      maxLength={50}
                    />
                    <View style={styles.validationRow}>
                      {nameWarning && <Text style={styles.warningText}>{nameWarning}</Text>}
                      {nameSuccess && <Text style={styles.successText}>{nameSuccess}</Text>}
                      <Text style={styles.charCount}>{name.length}/50</Text>
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Employee ID</Text>
                    <TextInput
                      style={styles.input}
                      value={employeeId}
                      onChangeText={(val) => setEmployeeId(val.toUpperCase())}
                      placeholder="e.g. EMP001"
                      placeholderTextColor="#666666"
                      maxLength={20}
                      autoCapitalize="characters"
                    />
                    <View style={styles.validationRow}>
                      {employeeIdWarning && <Text style={styles.warningText}>{employeeIdWarning}</Text>}
                      {employeeIdSuccess && <Text style={styles.successText}>{employeeIdSuccess}</Text>}
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Assigned Role</Text>
                    <RolePicker value={role} onChange={setRole} />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Local Device Partition</Text>
                    <View style={styles.readonlyPartition}>
                      <Text style={styles.readonlyPartitionText}>{partition}</Text>
                    </View>
                    <Text style={styles.helperText}>Locked to offline hardware cache settings.</Text>
                  </View>
                </View>

                <Button
                  label="Continue to Camera"
                  onPress={handleContinueToCamera}
                  disabled={!nameSuccess || !employeeIdSuccess || !!nameWarning || !!employeeIdWarning || isNameChecking || isEmployeeIdChecking}
                  loading={isNameChecking || isEmployeeIdChecking}
                  style={styles.actionBtn}
                />
                <Button
                  label="Cancel"
                  onPress={() => navigation.goBack()}
                  variant="outline"
                  style={styles.actionBtn}
                />
              </View>
            )}

            {/* STATE: PROCESSING */}
            {state === 'processing' && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#00E5FF" style={styles.processingSpinner} />
                <Text style={styles.processingText}>Enrolling securely...</Text>
                <Text style={styles.processingSubtext}>Encrypting biometric vectors locally</Text>
              </View>
            )}

            {/* STATE: SUCCESS */}
            {state === 'success' && (
              <View style={styles.feedbackContainer}>
                <Animated.View style={[styles.badge, styles.successBadge, { transform: [{ scale: badgeScale }], opacity: badgeScale.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]}>
                  <Text style={styles.badgeIcon}>✓</Text>
                </Animated.View>

                <Text style={styles.feedbackTitle}>Enrolled Successfully</Text>
                
                <View style={styles.profileDetailsCard}>
                  <Text style={styles.profileName}>{name.trim()}</Text>
                  
                  <View style={styles.badgeRow}>
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{role}</Text>
                    </View>
                    <View style={styles.partitionBadge}>
                      <Text style={styles.partitionBadgeText}>{partition}</Text>
                    </View>
                  </View>
                  
                  <Text style={styles.profileIdText}>Employee ID: {enrollmentResult?.userId || employeeId.trim()}</Text>
                  <Text style={styles.timestampText}>Registered: {new Date(enrollmentResult?.enrolledAt || Date.now()).toLocaleString()}</Text>
                </View>

                <Button label="Enroll Another" onPress={resetFlow} style={styles.actionBtn} />
                <Button label="Go to Dashboard" onPress={() => navigation.navigate('Home' as any)} variant="outline" style={styles.actionBtn} />
              </View>
            )}

            {/* STATE: ERROR */}
            {state === 'error' && (
              <View style={styles.feedbackContainer}>
                <Animated.View style={[styles.badge, styles.errorBadge, { transform: [{ scale: badgeScale }] }]}>
                  <Text style={styles.badgeIcon}>✕</Text>
                </Animated.View>

                <Text style={styles.feedbackTitle}>Enrollment Failed</Text>
                <Text style={styles.errorDescription}>{getErrorMessage()}</Text>

                <Button label="Try Again" onPress={retryFromState} style={styles.actionBtn} />
                <Button label="Cancel & Go Back" onPress={resetFlow} variant="outline" style={styles.actionBtn} />
              </View>
            )}

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
  container: {
    flex: 1,
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexGrow: 1,
  },
  stepContainer: {
    flex: 1,
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
    marginBottom: 18,
  },
  label: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#A0A0A0',
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    height: 48,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 16,
  },
  charCount: {
    fontSize: 11,
    color: '#666666',
    textAlign: 'right',
    marginTop: 4,
  },
  readonlyPartition: {
    height: 48,
    backgroundColor: '#111111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222222',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  readonlyPartitionText: {
    color: '#888888',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1,
  },
  helperText: {
    fontSize: 11,
    color: '#666666',
    marginTop: 4,
  },
  actionBtn: {
    marginVertical: 6,
    height: 46,
  },
  cameraOverlayHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 20 : 16,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  cancelLink: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 6,
  },
  cancelLinkText: {
    color: '#FF3B3B',
    fontSize: 12,
    fontWeight: '700',
  },
  cameraTitle: {
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 16,
  },
  progressOverlay: {
    position: 'absolute',
    bottom: 150,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(10, 10, 10, 0.85)',
    borderWidth: 1,
    borderColor: '#333333',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  progressTitle: {
    fontFamily: 'System',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  progressSubtitle: {
    fontFamily: 'System',
    color: '#888888',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 12,
  },
  progressBarContainer: {
    width: '100%',
    height: 6,
    backgroundColor: '#222222',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00FF88',
  },
  progressPercentage: {
    fontFamily: 'System',
    color: '#00FF88',
    fontSize: 14,
    fontWeight: '800',
  },
  errorBanner: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(10, 10, 10, 0.95)',
    borderColor: '#FF3B3B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    zIndex: 25,
  },
  livenessWarning: {
    color: '#FF3B3B',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    height: 36,
    width: 120,
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  processingSpinner: {
    marginBottom: 24,
  },
  processingText: {
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  processingSubtext: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#666666',
  },
  feedbackContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  badge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successBadge: {
    backgroundColor: '#00E676',
  },
  errorBadge: {
    backgroundColor: '#FF1744',
  },
  badgeIcon: {
    fontSize: 40,
    color: '#0A0A0A',
    fontWeight: 'bold',
  },
  feedbackTitle: {
    fontFamily: 'System',
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  profileDetailsCard: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
  },
  profileName: {
    fontFamily: 'System',
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  roleBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderColor: 'rgba(0, 229, 255, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  roleBadgeText: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  partitionBadge: {
    backgroundColor: '#222222',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  partitionBadgeText: {
    color: '#A0A0A0',
    fontSize: 11,
    fontWeight: '700',
  },
  profileIdText: {
    fontSize: 11,
    fontFamily: 'Courier',
    color: '#666666',
    marginBottom: 4,
  },
  timestampText: {
    fontSize: 11,
    color: '#888888',
    marginTop: 4,
    fontFamily: 'System',
  },
  errorDescription: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  validationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  warningText: {
    color: '#FF3B3B',
    fontSize: 12,
    fontWeight: '600',
  },
  successText: {
    color: '#00C853',
    fontSize: 12,
    fontWeight: '600',
  },
  poseLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 10, 10, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  poseSuccessOverlay: {
    backgroundColor: 'rgba(0, 200, 83, 0.9)',
  },
  poseSuccessIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  poseSuccessText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
});
