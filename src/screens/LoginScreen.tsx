import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { useMMKVBoolean } from 'react-native-mmkv';
import { AuthStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { storage } from '../store';

type Props = StackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [, setIsAdminMode] = useMMKVBoolean('isAdminMode', storage);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('password');

  const handleAdminLogin = () => {
    setIsAdminMode(true);
    navigation.navigate('AdminDashboard');
  };

  const handleFieldMode = () => {
    setIsAdminMode(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.header}>
            <Text style={styles.logo}>DATALAKE</Text>
            <Text style={styles.subtitle}>OFFLINE FACE RECOGNITION</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Admin Portal</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Enter username"
                placeholderTextColor="#666"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Enter password"
                placeholderTextColor="#666"
                autoCapitalize="none"
              />
            </View>

            <Button
              label="Login as Admin"
              onPress={handleAdminLogin}
              style={styles.loginBtn}
            />
          </View>

          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            label="Enter Field Operator Mode"
            onPress={handleFieldMode}
            variant="outline"
            style={styles.fieldBtn}
          />
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
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontFamily: 'System',
    fontSize: 32,
    fontWeight: '900',
    color: '#00E5FF',
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
    color: '#A0A0A0',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  cardTitle: {
    fontFamily: 'System',
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
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
  loginBtn: {
    marginTop: 12,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 32,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#222222',
  },
  dividerText: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#666666',
    paddingHorizontal: 16,
    fontWeight: '600',
  },
  fieldBtn: {
    height: 50,
  },
});
