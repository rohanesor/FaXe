import { StoredEmbedding, MatchResult } from '../../types/recognition';
import { deserializeEmbedding } from './EmbeddingSerializer';
import { RECOGNITION_THRESHOLD } from '../../utils/constants';

/**
 * Phase 6 - Matching Engine.
 * Computes Cosine Similarity and finds the highest scoring match.
 */
export class FaceMatcher {
  /**
   * Compares live embedding against candidate database templates.
   */
  public static match(
    liveEmbedding: Float32Array,
    candidates: StoredEmbedding[],
    threshold: number = RECOGNITION_THRESHOLD
  ): MatchResult {
    const startTime = Date.now();
    let bestUserId: string | null = null;
    let highestSimilarity = -1;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const candidateVector = deserializeEmbedding(candidate.embeddingBlob);
      const similarity = this.cosineSimilarity(liveEmbedding, candidateVector);

      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestUserId = candidate.userId;
      }
    }

    const matched = highestSimilarity >= threshold;

    return {
      matched,
      userId: matched ? bestUserId : null,
      confidence: highestSimilarity,
      matchTimeMs: Date.now() - startTime,
    };
  }

  private static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      console.warn(`[FaceMatcher] Dimension mismatch: live ${a.length} vs stored ${b.length}`);
      return 0;
    }
    let dotProduct = 0;
    const len = a.length;
    for (let i = 0; i < len; i++) {
      dotProduct += a[i] * b[i];
    }
    return dotProduct;
  }
}
