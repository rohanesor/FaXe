import { VerificationResult } from '../types/verification';

export type AuthStackParamList = {
  Login: undefined;
  AdminDashboard: undefined;
};

export type MainStackParamList = {
  Home: undefined;
  Enroll: undefined;
  Verify: undefined;
  Result: { result: VerificationResult };
  Settings: undefined;
};
