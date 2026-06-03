import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { initDatabase } from './src/modules/database';

function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        // Initialize KeyManager (Keychain keys) and DatabaseManager (SQLite connection)
        await initDatabase();
        setIsInitializing(false);
      } catch (error: any) {
        console.error('[AppBootstrap] Critical initialization failure:', error);
        setInitError(error.message || 'Storage initialization failed.');
        Alert.alert(
          'Security Initialization Failure',
          'A critical error occurred while opening the secure storage layer. Please verify biometric permissions or restart the app.',
          [{ text: 'OK', onPress: () => {} }]
        );
      }
    };
    bootstrap();
  }, []);

  if (isInitializing) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
        <View style={styles.splashContainer}>
          <View style={styles.brandingBox}>
            <Text style={styles.logoText}>DATALAKE</Text>
            <Text style={styles.logoSubtext}>SECURE FACE AUTH</Text>
          </View>
          
          <ActivityIndicator size="large" color="#00E5FF" style={styles.spinner} />
          
          <Text style={styles.loadingText}>Initializing secure storage...</Text>
          
          {initError && (
            <Text style={styles.errorText}>Error: {initError}</Text>
          )}
          
          <Text style={styles.versionText}>v1.12.0 • OFFLINE ACTIVE MODE</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
        <AppNavigator />
      </NavigationContainer>
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

