export interface User {
  id: string;
  name: string;
  role: string;
  partition: string;
  embeddingBlob: string; // Base64 encoded or binary blob string of TFLite face embedding
  enrolledAt: string;    // ISO timestamp
  lastSeen: string;      // ISO timestamp
  syncStatus: 'synced' | 'pending' | 'failed';
}

export interface AuthLog {
  id: string;
  userId: string;
  timestamp: string;     // ISO timestamp
  result: 'success' | 'failure' | 'spoof';
  confidence: number;    // Recognition confidence score
  livenessScore: number; // Liveness detection challenge score
  location?: {
    latitude: number;
    longitude: number;
  };
  synced: boolean;
}

export interface SyncQueueItem {
  id: string;
  action: 'enroll_user' | 'log_auth' | 'delete_user';
  payload: string;       // JSON string of data to sync
  createdAt: string;     // ISO timestamp
  attempts: number;
  lastAttempt?: string;  // ISO timestamp
}

export interface RecognitionResult {
  matched: boolean;
  userId?: string;
  confidence: number;
  livenessScore: number;
  timestamp: string;     // ISO timestamp
}
