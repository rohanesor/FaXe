import { VerificationResult } from '../types/verification';

export type AuthStackParamList = {
  Login: undefined;
  AdminDashboard: undefined;
};

export type MainStackParamList = {
  Home: undefined;
  Enroll: { prefill?: { name: string; role: 'worker' | 'admin' | 'visitor'; partition: string } } | undefined;
  Verify: undefined;
  Result: { result: VerificationResult };
  Settings: undefined;
  Provisioning: undefined;
  MetricsDashboard: undefined;
};
