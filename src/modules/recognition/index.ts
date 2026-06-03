import { AlignedFaceFrame } from '../../types/camera';
import { StoredEmbedding, MatchResult } from '../../types/recognition';
import { generateEmbedding } from './EmbeddingGenerator';
import { matchEmbedding } from './EmbeddingMatcher';

/**
 * Executes the end-to-end biometric face recognition pipeline.
 * Takes the aligned face image crop frame, extracts a 128-float embedding vector 
 * using the loaded TFLite model, runs a brute-force linear search over the database 
 * of registered candidate embeddings using Cosine Similarity, and returns the MatchResult.
 */
export async function recognizeFace(
  faceFrame: AlignedFaceFrame,
  candidates: StoredEmbedding[]
): Promise<MatchResult> {
  const pipelineStart = Date.now();

  try {
    // 1. Generate the 128-float feature vector embedding
    const { embedding } = await generateEmbedding(faceFrame.base64jpeg);

    // 2. Perform Cosine Similarity matching across candidates
    const matchResult = matchEmbedding(embedding, candidates);

    // 3. Compute overall pipeline latency (inference + match scan)
    const overallTimeMs = Date.now() - pipelineStart;

    return {
      ...matchResult,
      matchTimeMs: overallTimeMs,
    };
  } catch (error: any) {
    console.error('[FaceRecognition] Pipeline execution failed:', error);
    
    // Return failed match with latency metrics in case of system failures
    return {
      matched: false,
      userId: null,
      confidence: 0,
      matchTimeMs: Date.now() - pipelineStart,
    };
  }
}

// Re-export core modules for simplified client usage
export { modelLoader } from './ModelLoader';
export { generateEmbedding } from './EmbeddingGenerator';
export { matchEmbedding, computeCosineSimilarity } from './EmbeddingMatcher';
export { serializeEmbedding, deserializeEmbedding } from './EmbeddingSerializer';
export { runRecognitionBenchmark } from './BenchmarkTest';
