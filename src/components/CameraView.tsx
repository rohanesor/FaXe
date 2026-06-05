import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Animated } from 'react-native';
import { Camera, CameraRef } from 'react-native-vision-camera';
import { cameraManager } from '../modules/camera/CameraManager';
import { AlignedFaceFrame } from '../types/camera';
import { Images } from 'react-native-nitro-image';

import { BlazeFaceDetector } from '../modules/recognition/BlazeFaceDetector';
import { FacePreprocessor } from '../modules/recognition/FacePreprocessor';
import { analyzeImageQuality, QualityMetrics } from '../modules/recognition/ImageQualityAnalyzer';

interface LocalCameraViewProps {
  onFaceAligned: (frameData: AlignedFaceFrame, yaw: number, pitch: number) => void;
  isActive: boolean;
  isLivenessBackground?: boolean;
  isEnrollment?: boolean;
  targetPose?: 'Front' | 'Left' | 'Right' | 'Up' | 'Down';
  baselineYaw?: number;
  baselinePitch?: number;
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  const l = bytes.length;
  for (i = 0; i < l; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < l ? bytes[i + 1] : 0;
    const b2 = i + 2 < l ? bytes[i + 2] : 0;
    
    const c0 = b0 >> 2;
    const c1 = ((b0 & 3) << 4) | (b1 >> 4);
    const c2 = i + 1 < l ? (((b1 & 15) << 2) | (b2 >> 6)) : 64;
    const c3 = i + 2 < l ? (b2 & 63) : 64;
    
    result += alphabet[c0];
    result += alphabet[c1];
    result += c2 === 64 ? '=' : alphabet[c2];
    result += c3 === 64 ? '=' : alphabet[c3];
  }
  return result;
}

export function CameraView({
  onFaceAligned,
  isActive,
  isLivenessBackground = false,
  isEnrollment = false,
  targetPose = 'Front',
  baselineYaw = 0,
  baselinePitch = 0,
}: LocalCameraViewProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  // Real-time face bounding box on screen
  const [faceBox, setFaceBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // HUD quality metrics state variables
  const [faceDetected, setFaceDetected] = useState<boolean>(false);
  const [lightingStatus, setLightingStatus] = useState<'Good' | 'Low Light' | 'Too Bright'>('Good');
  const [blurScore, setBlurScore] = useState<number>(0);
  const [blurStatus, setBlurStatus] = useState<'Sharp' | 'Blurry'>('Blurry');
  const [poseDetected, setPoseDetected] = useState<'Front' | 'Left' | 'Right' | 'Up' | 'Down'>('Front');

  // Animation values
  const radarAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1.0)).current;
  const cameraRef = useRef<CameraRef>(null);

  // Central circular scanner guide settings
  const circleSize = 250;
  const circleCenterX = screenWidth / 2;
  const circleCenterY = screenHeight * 0.40;

  const device = cameraManager.getFrontCamera();

  // Permissions
  useEffect(() => {
    let active = true;
    const checkPerms = async () => {
      const granted = await cameraManager.hasPermission();
      if (active) {
        setHasPermission(granted);
      }
    };
    checkPerms();
    return () => { active = false; };
  }, []);

  // Radar circular rotation/pulsing animation
  useEffect(() => {
    if (isActive && !isLivenessBackground) {
      Animated.loop(
        Animated.timing(radarAnim, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        })
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      radarAnim.setValue(0);
      pulseAnim.setValue(1.0);
    }
  }, [isActive, isLivenessBackground, radarAnim, pulseAnim]);

  // Main high-frequency analysis loop
  useEffect(() => {
    if (isLivenessBackground || !isActive) {
      setFaceBox(null);
      setFaceDetected(false);
      return;
    }

    let isMounted = true;
    let loopTimeoutId: any;

    const runAnalysisLoop = async () => {
      if (!isMounted || isLivenessBackground || !isActive) return;

      try {
        if (hasPermission && device && cameraRef.current) {
          // 1. Take snapshot
          const image = await cameraRef.current.takeSnapshot();
          if (!isMounted) return;

          // 2. Crop center square to avoid aspect ratio squeezing/stretching
          const squareSize = Math.min(image.width, image.height);
          const startX = Math.max(0, Math.round((image.width - squareSize) / 2));
          const startY = Math.max(0, Math.round((image.height - squareSize) / 2));

          const squareCrop = await image.cropAsync(startX, startY, squareSize, squareSize);
          const squareResized = await squareCrop.resizeAsync(256, 256);

          // 3. Encode resized square to base64 jpeg for detector
          const encoded = await squareResized.toEncodedImageDataAsync('jpg', 80);
          const base64SquareJpeg = 'data:image/jpeg;base64,' + encodeBase64(new Uint8Array(encoded.buffer));

          // 4. Run BlazeFace inference
          const detections = await BlazeFaceDetector.detect(base64SquareJpeg, 0.65);
          if (!isMounted) return;

          if (detections.length > 0) {
            // Pick primary face
            const face = detections[0];

            // 5. Compute horizontal eye alignment & center crop face natively (112x112)
            const alignedJsi = await FacePreprocessor.alignAndCropFace(
              squareResized,
              face.boundingBox,
              face.landmarks
            );

            // Convert aligned crop to base64 for embedding/liveness
            const alignedEncoded = await alignedJsi.toEncodedImageDataAsync('jpg', 85);
            const alignedBase64 = 'data:image/jpeg;base64,' + encodeBase64(new Uint8Array(alignedEncoded.buffer));

            // 6. Analyze quality metrics of the aligned crop
            const metrics = await analyzeImageQuality(alignedBase64);
            if (!isMounted) return;

            // Update UI states
            setFaceDetected(true);
            setLightingStatus(metrics.lightingStatus);
            setBlurScore(metrics.blurScore);
            setBlurStatus(metrics.blurStatus);
            setPoseDetected(metrics.poseDetected);

            // 7. Calculate pixel coordinates of bounding box relative to screen
            // Since square resized maps to center square area on screen:
            const screenSquareSize = Math.min(screenWidth, screenHeight);
            const screenStartX = (screenWidth - screenSquareSize) / 2;
            const screenStartY = (screenHeight - screenSquareSize) / 2;

            // Map [0, 1] relative to square crop
            const left = screenStartX + face.boundingBox.x * screenSquareSize;
            const top = screenStartY + face.boundingBox.y * screenSquareSize;
            const width = face.boundingBox.width * screenSquareSize;
            const height = face.boundingBox.height * screenSquareSize;

            setFaceBox({ x: left, y: top, width, height });

            // 8. Fire callback if the frame is sharp and lighting is okay
            // Auto-accept lighting in low-light since we perform auto-enhancement
            console.log(`[CameraView] Face detected: score=${face.score.toFixed(2)}, blur=${metrics.blurScore.toFixed(1)} (${metrics.blurStatus}), yaw=${metrics.rawYaw.toFixed(3)}, pitch=${metrics.rawPitch.toFixed(3)}`);
            if (metrics.blurStatus === 'Sharp') {
              onFaceAligned(
                {
                  timestamp: Date.now(),
                  width: 112,
                  height: 112,
                  base64jpeg: alignedBase64,
                },
                metrics.rawYaw,
                metrics.rawPitch
              );
            }
          } else {
            // No face detected
            setFaceDetected(false);
            setFaceBox(null);
          }
        }
      } catch (err) {
        console.warn('[CameraView] Continuous analysis loop warning:', err);
      }

      // Schedule next run (150ms interval for fast, responsive Face ID flow)
      if (isMounted) {
        loopTimeoutId = setTimeout(runAnalysisLoop, 150);
      }
    };

    // Wait 800ms for camera initialization
    loopTimeoutId = setTimeout(runAnalysisLoop, 800);

    return () => {
      isMounted = false;
      clearTimeout(loopTimeoutId);
    };
  }, [
    isActive,
    isLivenessBackground,
    screenWidth,
    screenHeight,
    onFaceAligned,
    hasPermission,
    device,
  ]);

  const radarSpin = radarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const getGuideColor = () => {
    if (!faceDetected) return '#666666';
    if (blurStatus === 'Blurry') return '#FFD600'; // warning yellow for blur
    return '#00FF88'; // green for sharp/perfect
  };

  const getStatusText = () => {
    if (!faceDetected) return 'Looking for face...';
    if (blurStatus === 'Blurry') return 'Hold still (focusing)...';
    if (lightingStatus === 'Low Light') return 'Scanning (Enhancing Low Light)...';
    return 'Scanning face...';
  };

  if (isLivenessBackground) {
    return (
      <View style={[styles.container, { backgroundColor: 'transparent' }]}>
        {hasPermission && device ? (
          <Camera
            ref={cameraRef}
            style={styles.fullscreenCamera}
            device={device}
            isActive={isActive}
          />
        ) : (
          <View style={[styles.cameraMock, { opacity: 0.3 }]}>
            <Text style={styles.mockText}>Liveness Cam Active</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {hasPermission && device ? (
        <Camera
          ref={cameraRef}
          style={styles.fullscreenCamera}
          device={device}
          isActive={isActive}
        />
      ) : (
        <View style={styles.cameraMock}>
          <View style={styles.gridLineH} />
          <View style={styles.gridLineV} />
          <Text style={styles.mockText}>Camera Viewfinder</Text>
        </View>
      )}

      <View style={styles.overlayContainer}>
        {/* Apple Face ID-like Circular Scanner Frame */}
        <View style={styles.scannerOuterContainer}>
          <Animated.View
            style={[
              styles.radarRing,
              {
                width: circleSize,
                height: circleSize,
                top: circleCenterY - circleSize / 2,
                left: circleCenterX - circleSize / 2,
                borderColor: getGuideColor(),
                transform: [{ rotate: radarSpin }, { scale: pulseAnim }],
              },
            ]}
          />
          <View
            style={[
              styles.radarCircle,
              {
                width: circleSize - 6,
                height: circleSize - 6,
                top: circleCenterY - (circleSize - 6) / 2,
                left: circleCenterX - (circleSize - 6) / 2,
                borderColor: getGuideColor() + '44', // Semi-transparent border
              },
            ]}
          />
        </View>

        {/* Dynamic Face Box Reticle */}
        {faceBox && (
          <View
            style={[
              styles.faceReticle,
              {
                left: faceBox.x,
                top: faceBox.y,
                width: faceBox.width,
                height: faceBox.height,
                borderColor: getGuideColor(),
              },
            ]}
          >
            <View style={[styles.reticleBracket, styles.bracketTL, { borderColor: getGuideColor() }]} />
            <View style={[styles.reticleBracket, styles.bracketTR, { borderColor: getGuideColor() }]} />
            <View style={[styles.reticleBracket, styles.bracketBL, { borderColor: getGuideColor() }]} />
            <View style={[styles.reticleBracket, styles.bracketBR, { borderColor: getGuideColor() }]} />
          </View>
        )}

        {/* Real-time Quality Metrics HUD */}
        <View style={styles.hudCard}>
          <Text style={styles.hudTitle}>BIOMETRIC QUALITY ASSURANCE</Text>
          <View style={styles.hudGrid}>
            <View style={styles.hudRow}>
              <Text style={styles.hudLabel}>Face Detected:</Text>
              <Text style={[styles.hudValue, faceDetected ? styles.hudGreen : styles.hudRed]}>
                {faceDetected ? '🟢 DETECTED' : '🔴 SEARCHING...'}
              </Text>
            </View>
            <View style={styles.hudRow}>
              <Text style={styles.hudLabel}>Lighting Quality:</Text>
              <Text style={[styles.hudValue, lightingStatus === 'Good' ? styles.hudGreen : styles.hudYellow]}>
                {lightingStatus === 'Good' ? '🟢 GOOD' : lightingStatus === 'Low Light' ? '🟡 LOW LIGHT (AUTO)' : '🔴 OVEREXPOSED'}
              </Text>
            </View>
            <View style={styles.hudRow}>
              <Text style={styles.hudLabel}>Sharpness Score:</Text>
              <Text style={[styles.hudValue, blurStatus === 'Sharp' ? styles.hudGreen : styles.hudRed]}>
                {blurStatus === 'Sharp' ? `🟢 SHARP (${blurScore.toFixed(0)})` : `🔴 BLURRY (${blurScore.toFixed(0)})`}
              </Text>
            </View>
            <View style={styles.hudRow}>
              <Text style={styles.hudLabel}>Pose Bin:</Text>
              <Text style={[styles.hudValue, faceDetected ? styles.hudGreen : styles.hudRed]}>
                {faceDetected ? `🟢 ${poseDetected.toUpperCase()}` : '🔴 NONE'}
              </Text>
            </View>
          </View>
        </View>

        {/* Status Indicator Banner */}
        <View style={styles.bannerContainer}>
          <View style={[styles.banner, { borderColor: getGuideColor() }]}>
            <View style={[styles.bannerDot, { backgroundColor: getGuideColor() }]} />
            <Text style={[styles.bannerText, { color: getGuideColor() }]}>
              {getStatusText()}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    overflow: 'hidden',
  },
  fullscreenCamera: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  cameraMock: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0E0E0E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
  },
  mockText: {
    color: '#333333',
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFill,
  },
  scannerOuterContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  radarCircle: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  faceReticle: {
    position: 'absolute',
    borderWidth: 1,
    borderStyle: 'solid',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  reticleBracket: {
    position: 'absolute',
    width: 12,
    height: 12,
  },
  bracketTL: {
    top: -1,
    left: -1,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
  },
  bracketTR: {
    top: -1,
    right: -1,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
  },
  bracketBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
  },
  bracketBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
  },
  hudCard: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(18, 18, 18, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  hudTitle: {
    fontFamily: 'System',
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  hudGrid: {
    flexDirection: 'column',
  },
  hudRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3,
  },
  hudLabel: {
    color: '#A0A0A0',
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
  },
  hudValue: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
  },
  hudGreen: {
    color: '#00FF88',
  },
  hudRed: {
    color: '#FF3B3B',
  },
  hudYellow: {
    color: '#FFD600',
  },
  bannerContainer: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  bannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  bannerText: {
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
