import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, Alert, Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { initDatabase } from './src/modules/database';
import { modelManager } from './src/modules/recognition';
import { syncEngine } from './src/modules/sync/SyncEngine';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ToastContainer, setGlobalToastRef } from './src/components/Toast';
import { Logger } from './src/utils/logger';

function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [showSplashOverlay, setShowSplashOverlay] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Initializing secure database...');
  const [displayedStatus, setDisplayedStatus] = useState('Initializing secure database...');
  const [initError, setInitError] = useState<string | null>(null);

  // Animated Values for premium UI effects
  const logoScale = useRef(new Animated.Value(0.4)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const pulseScale1 = useRef(new Animated.Value(0.8)).current;
  const pulseOpacity1 = useRef(new Animated.Value(0)).current;
  const pulseScale2 = useRef(new Animated.Value(0.8)).current;
  const pulseOpacity2 = useRef(new Animated.Value(0)).current;
  const laserTranslateY = useRef(new Animated.Value(0)).current;
  const statusOpacity = useRef(new Animated.Value(1)).current;
  const splashOpacity = useRef(new Animated.Value(1)).current;

  // 1. Initial logo spring & fade animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoScale, logoOpacity]);

  // 2. Loop animations: laser scanner line & pulsing sonar rings
  useEffect(() => {
    // Loop laser scanning line
    const laserAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(laserTranslateY, {
          toValue: 120, // slides from top to bottom inside a 130px box (accounting for padding)
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(laserTranslateY, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    laserAnimation.start();

    // Loop pulsing rings (sonar waves)
    const startSonar1 = () => {
      pulseScale1.setValue(0.8);
      pulseOpacity1.setValue(0.6);
      Animated.parallel([
        Animated.timing(pulseScale1, {
          toValue: 2.2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity1, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]).start(() => startSonar1());
    };

    const startSonar2 = () => {
      pulseScale2.setValue(0.8);
      pulseOpacity2.setValue(0.6);
      Animated.parallel([
        Animated.timing(pulseScale2, {
          toValue: 2.2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity2, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
         }),
      ]).start(() => startSonar2());
    };

    startSonar1();
    const timer = setTimeout(() => {
      startSonar2();
    }, 1000);

    return () => {
      laserAnimation.stop();
      clearTimeout(timer);
    };
  }, [laserTranslateY, pulseScale1, pulseOpacity1, pulseScale2, pulseOpacity2]);

  // 3. Smooth fade transition for loading status updates
  useEffect(() => {
    Animated.timing(statusOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setDisplayedStatus(loadingStatus);
      Animated.timing(statusOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });
  }, [loadingStatus, statusOpacity]);

  // 4. App bootstrap orchestrator
  useEffect(() => {
    const bootstrap = async () => {
      try {
        // Step 1: Initialize secure SQLite database & KeyManager
        setLoadingStatus('Initializing secure database...');
        await initDatabase();
        
        // Step 2: Initialize TFLite model (MobileFaceNet)
        setLoadingStatus('Loading face recognition models...');
        await modelManager.loadModel();

        // Step 3: Run connectivity check & start background sync interval
        setLoadingStatus('Starting background synchronization...');
        syncEngine.schedulePeriodicSync(15 * 60 * 1000);

        setIsInitializing(false);
      } catch (error: any) {
        Logger.error('AppBootstrap', 'Critical startup phase exception', error);
        setInitError(error.message || 'System initialization failed.');
        Alert.alert(
          'Security Initialization Failure',
          'A critical error occurred while opening the secure storage layer. Please verify biometric permissions or restart the app.',
          [{ text: 'OK', onPress: () => {} }]
        );
      }
    };
    bootstrap();

    return () => {
      syncEngine.clearPeriodicSync();
    };
  }, []);

  // 5. Fade out splash screen when initialization finishes
  useEffect(() => {
    if (!isInitializing) {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        setShowSplashOverlay(false);
      });
    }
  }, [isInitializing, splashOpacity]);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <View style={styles.rootContainer}>
          <NavigationContainer>
            <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
            <AppNavigator />
          </NavigationContainer>

          {showSplashOverlay && (
            <Animated.View 
              style={[styles.splashOverlayContainer, { opacity: splashOpacity }]}
              pointerEvents={isInitializing ? 'auto' : 'none'}
            >
              <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
              <View style={styles.splashContainer}>
                <Animated.View style={[styles.brandingBox, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
                  <Text style={styles.logoText}>DATALAKE</Text>
                  <Text style={styles.logoSubtext}>SECURE FACE AUTH</Text>
                </Animated.View>

                {/* Premium Face ID style Scanner Graphic */}
                <View style={styles.scannerContainer}>
                  <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseScale1 }], opacity: pulseOpacity1 }]} />
                  <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseScale2 }], opacity: pulseOpacity2 }]} />
                  <View style={styles.reticleBox}>
                    <View style={[styles.bracket, styles.bracketTopLeft]} />
                    <View style={[styles.bracket, styles.bracketTopRight]} />
                    <View style={[styles.bracket, styles.bracketBottomLeft]} />
                    <View style={[styles.bracket, styles.bracketBottomRight]} />
                    <Animated.View style={[styles.laserLine, { transform: [{ translateY: laserTranslateY }] }]} />
                  </View>
                </View>
                
                <Animated.Text style={[styles.loadingText, { opacity: statusOpacity }]}>
                  {displayedStatus}
                </Animated.Text>
                
                {initError && (
                  <Text style={styles.errorText}>Error: {initError}</Text>
                )}
                
                <Text style={styles.versionText}>v1.12.0 • OFFLINE ACTIVE MODE</Text>
              </View>
            </Animated.View>
          )}
        </View>
        <ToastContainer ref={(ref) => setGlobalToastRef(ref)} />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  splashOverlayContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  splashContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  brandingBox: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoText: {
    fontFamily: 'System',
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  logoSubtext: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
    color: '#00E5FF',
    letterSpacing: 4,
    marginTop: 6,
  },
  loadingText: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#A0A0A0',
    letterSpacing: 0.5,
    marginTop: 16,
  },
  errorText: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#FF3B3B',
    marginTop: 16,
    textAlign: 'center',
  },
  versionText: {
    fontFamily: 'System',
    fontSize: 10,
    color: '#444444',
    position: 'absolute',
    bottom: 24,
    letterSpacing: 1,
  },
  scannerContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.35)',
    backgroundColor: 'rgba(0, 229, 255, 0.02)',
  },
  reticleBox: {
    width: 130,
    height: 130,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  bracket: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: '#00E5FF',
  },
  bracketTopLeft: {
    top: 8,
    left: 8,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
  },
  bracketTopRight: {
    top: 8,
    right: 8,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 6,
  },
  bracketBottomLeft: {
    bottom: 8,
    left: 8,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 6,
  },
  bracketBottomRight: {
    bottom: 8,
    right: 8,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 6,
  },
  laserLine: {
    position: 'absolute',
    top: 0,
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: '#00E5FF',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
});

export default App;
