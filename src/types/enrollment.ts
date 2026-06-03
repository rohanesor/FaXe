/**
 * TypeScript types and interfaces for the user enrollment flow.
 */

export interface EnrollmentFormInput {
  name: string;
  role: 'worker' | 'admin' | 'visitor';
  partition: string;
}

export interface EnrollmentResult {
  success: boolean;
  userId: string | null;
  name: string | null;
  enrolledAt: number | null; // epoch timestamp
  reason: 'DUPLICATE_FACE' | 'INVALID_INPUT' | 'INFERENCE_FAILED' | 'DATABASE_FAILED' | string | null;
  step: number | null;        // step index where the failure occurred (1 to 5)
}

export type EnrollmentState =
  | 'idle'
  | 'form'
  | 'camera'
  | 'liveness'
  | 'processing'
  | 'success'
  | 'error';
