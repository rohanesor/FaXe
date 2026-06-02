import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Animated } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { cameraManager } from '../modules/camera/CameraManager';
import { alignFace } from '../modules/camera/FaceAligner';
import { AlignedFaceFrame } from '../types/camera';

interface CameraViewProps {
  onFaceAligned: (frameData: AlignedFaceFrame) => void;
  isActive: boolean;
}

export function CameraView({ onFaceAligned, isActive }: CameraViewProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [alignmentState, setAlignmentState] = useState<'none' | 'far' | 'off-center' | 'aligned' | 'multiple'>('none');
  const [simulatedFace, setSimulatedFace] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  
  const scanAnim = useRef(new Animated.Value(0)).current;

  const ovalWidth = 220;
  const ovalHeight = 280;
  const ovalCenterX = screenWidth / 2;
  const ovalCenterY = screenHeight / 2 - 40;

  const device = cameraManager.getFrontCamera();

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

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, {
            toValue: 1,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(scanAnim, {
            toValue: 0,
            duration: 3000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scanAnim.setValue(0);
    }
  }, [isActive, scanAnim]);

  useEffect(() => {
    if (!isActive) {
      setSimulatedFace(null);
      setAlignmentState('none');
      return;
    }

    let intervalId: any;
    let ticks = 0;

    intervalId = setInterval(() => {
      ticks += 1;
      
      if (ticks <= 4) {
        setSimulatedFace(null);
        setAlignmentState('none');
      }
      else if (ticks <= 9) {
        setSimulatedFace({
          x: ovalCenterX - 35,
          y: ovalCenterY - 45,
          width: 70,
          height: 90,
        });
        setAlignmentState('far');
      }
      else if (ticks <= 13) {
        setSimulatedFace({
          x: ovalCenterX - 110,
          y: ovalCenterY - 80,
          width: 110,
          height: 140,
        });
        setAlignmentState('multiple');
      }
      else if (ticks <= 18) {
        setSimulatedFace({
          x: ovalCenterX - 140,
          y: ovalCenterY + 20,
          width: 140,
          height: 180,
        });
        setAlignmentState('off-center');
      }
      else if (ticks <= 24) {
        const targetFace = {
          x: ovalCenterX - (ovalWidth * 0.95) / 2,
          y: ovalCenterY - (ovalHeight * 0.95) / 2,
          width: ovalWidth * 0.95,
          height: ovalHeight * 0.95,
        };
        setSimulatedFace(targetFace);
        setAlignmentState('aligned');
        
        if (ticks === 24) {
          clearInterval(intervalId);
          alignFace(targetFace, screenWidth, screenHeight).then((alignedFrame) => {
            console.log('[CameraView] Face successfully aligned & cropped frame output:', alignedFrame);
            onFaceAligned(alignedFrame);
          });
        }
      }
    }, 500);

    return () => clearInterval(intervalId);
  }, [isActive, ovalCenterX, ovalCenterY, screenWidth, screenHeight, onFaceAligned]);

  const getBorderColor = () => {
    switch (alignmentState) {
      case 'aligned':
        return '#00C853';
      case 'multiple':
      case 'off-center':
        return '#FF3B3B';
      case 'far':
      case 'none':
      default:
        return '#FFB300';
    }
  };

  const getStatusText = () => {
    switch (alignmentState) {
      case 'aligned':
        return 'Hold still... Aligned!';
      case 'multiple':
        return 'Multiple faces detected!';
      case 'off-center':
        return 'Center your face';
      case 'far':
        return 'Move closer';
      case 'none':
      default:
        return 'Align face within oval guide';
    }
  };

  const translateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, ovalHeight],
  });

  return (
    <View style={styles.container}>
      {hasPermission && device ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isActive}
        />
      ) : (
        <View style={styles.cameraMock}>
          <View style={styles.gridLineH} />
          <View style={styles.gridLineV} />
          <Text style={styles.mockText}>Biometric Viewfinder: OFF-GRID ACTIVE</Text>
        </View>
      )}

      <View style={styles.overlayContainer}>
        <View
          style={[
            styles.ovalGuide,
            {
              width: ovalWidth,
              height: ovalHeight,
              top: ovalCenterY - ovalHeight / 2,
              left: ovalCenterX - ovalWidth / 2,
              borderColor: getBorderColor(),
            },
          ]}
        >
          {isActive && (
            <Animated.View
              style={[
                styles.scanningLine,
                {
                  transform: [{ translateY: translateY }],
                  backgroundColor: getBorderColor(),
                  shadowColor: getBorderColor(),
                },
              ]}
            />
          )}

          <View style={[styles.reticleCorner, styles.topLeft, { borderColor: getBorderColor() }]} />
          <View style={[styles.reticleCorner, styles.topRight, { borderColor: getBorderColor() }]} />
          <View style={[styles.reticleCorner, styles.bottomLeft, { borderColor: getBorderColor() }]} />
          <View style={[styles.reticleCorner, styles.bottomRight, { borderColor: getBorderColor() }]} />
        </View>

        {simulatedFace && (
          <View
            style={[
              styles.faceBoundingBox,
              {
                left: simulatedFace.x,
                top: simulatedFace.y,
                width: simulatedFace.width,
                height: simulatedFace.height,
                borderColor: getBorderColor(),
              },
            ]}
          >
            <View style={[styles.boxBracket, styles.bracketTL, { borderColor: getBorderColor() }]} />
            <View style={[styles.boxBracket, styles.bracketTR, { borderColor: getBorderColor() }]} />
            <View style={[styles.boxBracket, styles.bracketBL, { borderColor: getBorderColor() }]} />
            <View style={[styles.boxBracket, styles.bracketBR, { borderColor: getBorderColor() }]} />
            
            <View style={[styles.labelTag, { backgroundColor: getBorderColor() }]}>
              <Text style={styles.labelText}>
                {alignmentState === 'aligned' ? 'FACE: ALIGNED 94%' : 'FACE SCANNING'}
              </Text>
            </View>
          </View>
        )}

        {alignmentState === 'multiple' && (
          <View
            style={[
              styles.faceBoundingBox,
              styles.multipleFaceBox,
              {
                left: ovalCenterX + 30,
                top: ovalCenterY - 110,
              },
            ]}
          >
            <View style={[styles.labelTag, styles.dangerLabelTag]}>
              <Text style={styles.labelText}>FACE SCANNING</Text>
            </View>
          </View>
        )}

        <View style={styles.bannerContainer}>
          <View style={[styles.banner, { borderColor: getBorderColor() }]}>
            <View style={[styles.bannerDot, { backgroundColor: getBorderColor() }]} />
            <Text style={[styles.bannerText, { color: getBorderColor() }]}>
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
  ovalGuide: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2.5,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
  scanningLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  reticleCorner: {
    position: 'absolute',
    width: 16,
    height: 16,
  },
  topLeft: {
    top: 30,
    left: 30,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  topRight: {
    top: 30,
    right: 30,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  bottomLeft: {
    bottom: 30,
    left: 30,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  bottomRight: {
    bottom: 30,
    right: 30,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  faceBoundingBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'solid',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  boxBracket: {
    position: 'absolute',
    width: 10,
    height: 10,
  },
  bracketTL: {
    top: -1,
    left: -1,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  bracketTR: {
    top: -1,
    right: -1,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  bracketBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  bracketBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  labelTag: {
    position: 'absolute',
    top: -18,
    left: -1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  labelText: {
    color: '#0A0A0A',
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'System',
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
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  multipleFaceBox: {
    width: 80,
    height: 100,
    borderColor: '#FF3B3B',
  },
  dangerLabelTag: {
    backgroundColor: '#FF3B3B',
  },
});
