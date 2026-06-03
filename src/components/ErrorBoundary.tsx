import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import RNRestart from 'react-native-restart';
import { authLogRepository } from '../modules/database';
import { Button } from './Button';
import { Logger } from '../utils/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Standard React Class component serving as the absolute fallback container
 * to trap unhandled render exceptions, save database logs, and restore operational states.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Unknown render error' };
  }

  public componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    Logger.error('ErrorBoundary', `Unhandled component crash: ${error.message}`, error);
    
    // Log crash details into local SQLite logs under special app_error result
    authLogRepository.logAuthAttempt({
      userId: 'app_crash_handler',
      result: 'app_error',
      confidence: 0.0,
      livenessScore: 0.0,
    }).catch((dbError) => {
      Logger.error('ErrorBoundary', 'Failed to store crash logs in SQLite', dbError);
    });
  }

  private handleRestart = () => {
    RNRestart.Restart();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
          <View style={styles.content}>
            <View style={styles.brandingBox}>
              <Text style={styles.logoText}>DATALAKE</Text>
              <Text style={styles.logoSubtext}>SECURE FACE AUTH</Text>
            </View>

            <View style={styles.errorCard}>
              <Text style={styles.alertIcon}>⚠️</Text>
              <Text style={styles.errorTitle}>Something went wrong</Text>
              <Text style={styles.errorDescription}>
                An unhandled application error occurred during rendering. The crash details have been logged locally and will sync to AWS when online.
              </Text>
              <View style={styles.errorMsgContainer}>
                <Text style={styles.errorMessage}>Error: {this.state.errorMessage}</Text>
              </View>
            </View>

            <Button
              label="Restart App"
              onPress={this.handleRestart}
              style={styles.restartBtn}
            />
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    maxWidth: 400,
  },
  brandingBox: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontFamily: 'System',
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  logoSubtext: {
    fontFamily: 'System',
    fontSize: 10,
    fontWeight: '700',
    color: '#00E5FF',
    letterSpacing: 4,
    marginTop: 6,
  },
  errorCard: {
    width: '100%',
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#FF3B3B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 32,
  },
  alertIcon: {
    fontSize: 40,
    marginBottom: 16,
  },
  errorTitle: {
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorDescription: {
    fontFamily: 'System',
    fontSize: 13,
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  errorMsgContainer: {
    width: '100%',
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#222222',
  },
  errorMessage: {
    fontFamily: 'System',
    fontSize: 12,
    color: '#FF3B3B',
    fontWeight: '600',
  },
  restartBtn: {
    width: '100%',
    height: 50,
  },
});
