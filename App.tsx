import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { initDatabase } from './src/modules/database';
import { modelLoader } from './src/modules/recognition/ModelLoader';
import { syncEngine } from './src/modules/sync/SyncEngine';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ToastContainer, setGlobalToastRef } from './src/components/Toast';
import { Logger } from './src/utils/logger';

function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Initializing secure database...');
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        // Step 1: Initialize secure SQLite database & KeyManager
        setLoadingStatus('Initializing secure database...');
        await initDatabase();

        // Step 2: Initialize TFLite model (MobileFaceNet)
        setLoadingStatus('Loading face recognition models...');
        await modelLoader.loadModel();

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
      // Clear interval on cleanup
      syncEngine.clearPeriodicSync();
    };
  }, []);

  if (isInitializing) {
    return (
      <SafeAreaProvider>
        <ErrorBoundary>
          <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
          <View style={styles.splashContainer}>
            <View style={styles.brandingBox}>
              <Text style={styles.logoText}>DATALAKE</Text>
              <Text style={styles.logoSubtext}>SECURE FACE AUTH</Text>
            </View>
            
            <ActivityIndicator size="large" color="#00E5FF" style={styles.spinner} />
            
            <Text style={styles.loadingText}>{loadingStatus}</Text>
            
            {initError && (
              <Text style={styles.errorText}>Error: {initError}</Text>
            )}
            
            <Text style={styles.versionText}>v1.12.0 • OFFLINE ACTIVE MODE</Text>
          </View>
          <ToastContainer ref={(ref) => setGlobalToastRef(ref)} />
        </ErrorBoundary>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <NavigationContainer>
          <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
          <AppNavigator />
        </NavigationContainer>
        <ToastContainer ref={(ref) => setGlobalToastRef(ref)} />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
  spinner: {
    marginBottom: 24,
  },
  loadingText: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#A0A0A0',
    letterSpacing: 0.5,
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
});

export default App;
