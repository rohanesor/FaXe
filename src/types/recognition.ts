export interface StoredEmbedding {
  userId: string;
  embeddingBlob: Uint8Array; // 512-byte or 768-byte binary blob representing 128 or 192 Float32 values
  enrolledAt: string;        // ISO timestamp
}

export interface MatchResult {
  matched: boolean;
  userId: string | null;
  confidence: number;        // Cosine similarity score
  matchTimeMs: number;       // Elapsed matching execution duration
}

export interface EmbeddingError {
  code: 'MODEL_NOT_READY' | 'INVALID_INPUT' | 'INFERENCE_FAILED';
  message: string;
}
