import { FaceEmbeddingService } from '../recognition/FaceEmbeddingService';
import { enrollmentRepository, EnrollmentPayload } from '../database/EnrollmentRepository';

/**
 * Phase 5 - Multi-Pose Enrollment Service.
 * Collects 5 distinct poses, averages and normalizes their embeddings, and stores them in SQLite.
 */
export class EnrollmentService {
  /**
   * Enrolls a user with 5 pose images.
   */
  public async enrollMultiPose(
    payload: EnrollmentPayload,
    poses: {
      front: string;
      left: string;
      right: string;
      up: string;
      down: string;
    }
  ): Promise<void> {
    console.log(`[EnrollmentService] Initiating multi-pose enrollment for user ${payload.name}...`);
    
    const imageList = [poses.front, poses.left, poses.right, poses.up, poses.down];
    const embeddings: Float32Array[] = [];

    // 1. Generate embeddings for all 5 poses
    for (let i = 0; i < imageList.length; i++) {
      const img = imageList[i];
      console.log(`[EnrollmentService] Generating embedding for pose ${i + 1}/5...`);
      const emb = await FaceEmbeddingService.generateEmbedding(img);
      embeddings.push(emb);
    }

    // 2. Average embeddings dimension by dimension with 50% weight on the Front pose (index 0)
    console.log('[EnrollmentService] Calculating weighted average biometric vector...');
    const dim = embeddings[0]?.length || 192;
    const avgEmbedding = new Float32Array(dim);
    const numPoses = embeddings.length;

    const weights = new Float32Array(numPoses);
    if (numPoses > 1) {
      weights[0] = 0.50; // Front pose gets 50% weight
      const remainingWeight = 0.50 / (numPoses - 1);
      for (let p = 1; p < numPoses; p++) {
        weights[p] = remainingWeight;
      }
    } else {
      weights[0] = 1.0;
    }

    for (let d = 0; d < dim; d++) {
      let sum = 0;
      for (let p = 0; p < numPoses; p++) {
        sum += embeddings[p][d] * weights[p];
      }
      avgEmbedding[d] = sum;
    }

    // 3. Re-normalize the averaged vector (ensuring L2-unit length)
    console.log('[EnrollmentService] Normalizing final averaged embedding...');
    let sumSquares = 0;
    for (let i = 0; i < dim; i++) {
      sumSquares += avgEmbedding[i] * avgEmbedding[i];
    }
    const magnitude = Math.sqrt(sumSquares);
    if (magnitude > 0) {
      for (let i = 0; i < dim; i++) {
        avgEmbedding[i] /= magnitude;
      }
    }

    // 4. Securely store via repository
    console.log('[EnrollmentService] Saving template to database...');
    await enrollmentRepository.enrollUser(payload, avgEmbedding);
    console.log(`[EnrollmentService] User ${payload.name} successfully enrolled with average vector!`);
  }
}

export const enrollmentService = new EnrollmentService();
