/**
 * Verification outcome categories.
 */
export enum VerificationOutcome {
  VERIFIED = 'VERIFIED',
  NOT_RECOGNIZED = 'NOT_RECOGNIZED',
  SPOOF_DETECTED = 'SPOOF_DETECTED',
  NO_USERS_ENROLLED = 'NO_USERS_ENROLLED',
  ERROR = 'ERROR',
}

/**
 * Result of the end-to-end verification pipeline check.
 */
export interface VerificationResult {
  outcome: VerificationOutcome;
  userId: string | null;
  userName: string | null;
  role: string | null;
  confidence: number | null;
  livenessScore: number | null;
  pipelineTimeMs: number;
  message: string | null;
  timestamp?: string;
}

/**
 * Interactive screen state machine states.
 */
export type VerificationState = 'idle' | 'camera' | 'liveness' | 'processing' | 'done';
