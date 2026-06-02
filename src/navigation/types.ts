import { RecognitionResult } from '../types';

export type AuthStackParamList = {
  Login: undefined;
  AdminDashboard: undefined;
};

export type MainStackParamList = {
  Home: undefined;
  Enroll: undefined;
  Verify: undefined;
  Result: { result: RecognitionResult };
  Settings: undefined;
};
