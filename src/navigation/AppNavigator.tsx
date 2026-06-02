import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useMMKVBoolean } from 'react-native-mmkv';
import { storage } from '../store';
import { AuthStackParamList, MainStackParamList } from './types';

// Import screens
import { LoginScreen } from '../screens/LoginScreen';
import { AdminDashboardScreen } from '../screens/AdminDashboardScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { EnrollScreen } from '../screens/EnrollScreen';
import { VerifyScreen } from '../screens/VerifyScreen';
import { ResultScreen } from '../screens/ResultScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const AuthStack = createStackNavigator<AuthStackParamList>();
const MainStack = createStackNavigator<MainStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Home" component={HomeScreen} />
      <MainStack.Screen name="Enroll" component={EnrollScreen} />
      <MainStack.Screen name="Verify" component={VerifyScreen} />
      <MainStack.Screen name="Result" component={ResultScreen} />
      <MainStack.Screen name="Settings" component={SettingsScreen} />
    </MainStack.Navigator>
  );
}

export function AppNavigator() {
  const [isAdminMode] = useMMKVBoolean('isAdminMode', storage);

  return isAdminMode ? <AuthNavigator /> : <MainNavigator />;
}
