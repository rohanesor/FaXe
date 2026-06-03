/**
 * TypeScript interfaces and types for local SQLite database models,
 * repository inputs, and synchronization queues.
 */

export interface EnrollmentInput {
  userId: string;
  name: string;
  role: string;
  partition: string;
  embedding: Float32Array; // The raw 128-float face embedding vector
  enrolledAt: string;       // ISO timestamp
}

export interface StoredUser {
  id: string;
  name: string;            // Decrypted plain text name
  role: string;            // Decrypted plain text role
  partition: string;
  enrolledAt: string;      // ISO timestamp
  lastSeen: string;        // ISO timestamp
  syncStatus: 'pending' | 'synced' | 'failed' | 'inactive_flagged';
}

import { VerificationOutcome } from './verification';

export interface AuthLogInput {
  userId: string;
  result: 'success' | 'failure' | 'spoof' | 'app_error';
  confidence: number;      // Cosine similarity score
  livenessScore: number;   // Liveness sequence score
  latitude?: number | null;
  longitude?: number | null;
  outcome?: VerificationOutcome;
}

export interface SyncQueueItem {
  id: string;
  action: 'enroll_user' | 'log_auth' | 'delete_user';
  payload: string;         // Serialized JSON string describing payload
  createdAt: string;       // ISO timestamp
  attempts: number;        // Synchronization attempts (caps at 5)
  lastAttempt?: string;    // ISO timestamp (optional)
}
