import { userRepository } from './UserRepository';
import { StoredEmbedding } from '../../types/recognition';

export interface EnrollmentPayload {
  id: string;
  name: string;
  role: 'admin' | 'worker' | 'visitor';
  partition: string;
}

/**
 * Phase 4 - Database Storage Repository.
 * Wraps local SQLite biometric transactions.
 */
export class EnrollmentRepository {
  public async enrollUser(payload: EnrollmentPayload, embedding: Float32Array): Promise<void> {
    await userRepository.enrollUser({
      userId: payload.id,
      name: payload.name,
      role: payload.role,
      partition: payload.partition,
      embedding: embedding,
      enrolledAt: new Date().toISOString(),
    });
  }

  public async getCandidates(partition: string): Promise<StoredEmbedding[]> {
    return await userRepository.getEmbeddingsForPartition(partition);
  }
}

export const enrollmentRepository = new EnrollmentRepository();
