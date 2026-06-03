import { StoredEmbedding, MatchResult } from '../../types/recognition';
import { serializeEmbedding } from './EmbeddingSerializer';
import { matchEmbedding } from './EmbeddingMatcher';

/**
 * Generates a random L2-normalized 128-float embedding vector.
 * Utilizes random distribution and enforces strict L2 Euclidean normalization.
 */
function generateRandomNormalizedVector(): Float32Array {
  const vector = new Float32Array(128);
  let sumSquare = 0;
  
  for (let i = 0; i < 128; i++) {
    const coordinate = Math.random() * 2 - 1; // range [-1, 1]
    vector[i] = coordinate;
    sumSquare += coordinate * coordinate;
  }
  
  const norm = Math.sqrt(sumSquare);
  if (norm > 0) {
    for (let i = 0; i < 128; i++) {
      vector[i] /= norm;
    }
  }
  
  return vector;
}

/**
 * Runs a simulated face recognition performance benchmark by:
 * 1. Generating 5,000 mock enrolled embeddings in memory.
 * 2. Creating a positive probe matching one of the candidates with small variance.
 * 3. Creating a negative probe matching none of the candidates.
 * 4. Measuring the linear scan execution latency for both probes.
 * 5. Calculating operational throughput scores (comparisons per second).
 */
export function runRecognitionBenchmark(): {
  totalCandidates: number;
  positiveMatchTimeMs: number;
  negativeMatchTimeMs: number;
  positiveResult: MatchResult;
  negativeResult: MatchResult;
  throughputScore: number; // Single-vector searches per second
} {
  console.log('[BenchmarkTest] Initializing benchmark dataset of 5,000 users...');
  
  // 1. Populate the in-memory candidate array of 5,000 users
  const candidates: StoredEmbedding[] = [];
  for (let i = 0; i < 5000; i++) {
    const vector = generateRandomNormalizedVector();
    candidates.push({
      userId: `usr-bench-${i}`,
      embeddingBlob: serializeEmbedding(vector),
      enrolledAt: new Date().toISOString(),
    });
  }

  // 2. Select a target candidate to create a positive matching probe
  const targetIndex = 2500; // mid-way candidate
  const targetBlob = candidates[targetIndex].embeddingBlob;
  
  // Reconstruct the target Float32Array with memory-alignment safety
  const alignedBuffer = new ArrayBuffer(512);
  new Uint8Array(alignedBuffer).set(targetBlob);
  const targetVector = new Float32Array(alignedBuffer);
  
  // Perturb the target vector by adding 3% random noise to simulate real-world scan variances
  const positiveProbe = new Float32Array(128);
  let sumSquare = 0;
  for (let i = 0; i < 128; i++) {
    const noise = (Math.random() * 2 - 1) * 0.03;
    positiveProbe[i] = targetVector[i] + noise;
    sumSquare += positiveProbe[i] * positiveProbe[i];
  }
  
  // Re-normalize the positive probe vector to unit length
  const norm = Math.sqrt(sumSquare);
  for (let i = 0; i < 128; i++) {
    positiveProbe[i] /= norm;
  }

  // 3. Create a negative probe vector from scratch (independent random vector)
  const negativeProbe = generateRandomNormalizedVector();

  // 4. Benchmark positive search execution latency (scans 5,000 candidates)
  console.log('[BenchmarkTest] Starting positive search scan (should match usr-bench-2500)...');
  const posStart = Date.now();
  const positiveResult = matchEmbedding(positiveProbe, candidates);
  const positiveMatchTimeMs = Date.now() - posStart;

  // 5. Benchmark negative search execution latency (scans 5,000 candidates)
  console.log('[BenchmarkTest] Starting negative search scan (should not match)...');
  const negStart = Date.now();
  const negativeResult = matchEmbedding(negativeProbe, candidates);
  const negativeMatchTimeMs = Date.now() - negStart;

  // 6. Calculate throughput
  // A search scans 5,000 candidates. We performed 2 searches (10,000 total candidate comparisons).
  const combinedTimeMs = positiveMatchTimeMs + negativeMatchTimeMs;
  const throughputScore = combinedTimeMs > 0 ? Math.round((2000 / combinedTimeMs) * 10) / 10 : 2000;

  console.log(`[BenchmarkTest] Benchmark completed. 5k candidates linear scan: Positive: ${positiveMatchTimeMs}ms, Negative: ${negativeMatchTimeMs}ms`);

  return {
    totalCandidates: 5000,
    positiveMatchTimeMs,
    negativeMatchTimeMs,
    positiveResult,
    negativeResult,
    throughputScore,
  };
}
