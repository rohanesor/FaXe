import { AlignedFaceFrame } from '../../types/camera';
import { EnrollmentFormInput, EnrollmentResult } from '../../types/enrollment';
import { generateUUID } from '../../utils/uuid';
import { generateEmbedding } from '../recognition/EmbeddingGenerator';
import { recognizeFace } from '../recognition';
import { userRepository, wipeStoredEmbeddings } from '../database/UserRepository';
import { Logger } from '../../utils/logger';

/**
 * Orchestrator class managing offline biometric user enrollment sequences.
 * Runs validations, duplicates checking, biometric model generation, and secure storage writes.
 */
class EnrollmentManager {
  private static instance: EnrollmentManager;

  private constructor() {}

  public static getInstance(): EnrollmentManager {
    if (!EnrollmentManager.instance) {
      EnrollmentManager.instance = new EnrollmentManager();
    }
    return EnrollmentManager.instance;
  }

  /**
   * Executes the full offline face enrollment sequence.
   * Logs execution time in milliseconds.
   */
  public async enrollUser(
    input: EnrollmentFormInput,
    faceFrame: AlignedFaceFrame
  ): Promise<EnrollmentResult> {
    const startTime = Date.now();
    Logger.info('EnrollmentManager', 'Initializing enrollment pipeline...');

    try {
      // Step 1: Input Validation
      if (!input.name || input.name.trim().length === 0) {
        return this.failResult('INVALID_INPUT', 'Full Name cannot be empty.', 1);
      }
      if (input.name.length > 60) {
        return this.failResult('INVALID_INPUT', 'Full Name exceeds maximum limit of 60 characters.', 1);
      }
      if (!['worker', 'admin', 'visitor'].includes(input.role)) {
        return this.failResult('INVALID_INPUT', 'Selected role is invalid.', 1);
      }
      if (!input.partition || input.partition.trim().length === 0) {
        return this.failResult('INVALID_INPUT', 'Device partition code is not configured.', 1);
      }

      // Step 2: Check for Duplicate Face
      // Scan current partition embeddings. If probe face has similarity > 0.90, reject.
      Logger.info('EnrollmentManager', `Fetching existing partition users for '${input.partition}' to scan duplicates...`);
      const existingEmbeddings = await userRepository.getEmbeddingsForPartition(input.partition);
      
      try {
        if (existingEmbeddings.length > 0) {
          const matchResult = await recognizeFace(faceFrame, existingEmbeddings);
          Logger.info('EnrollmentManager', `Duplicate scan outcome: ${JSON.stringify(matchResult)}`);
          
          if (matchResult.confidence > 0.90) {
            return this.failResult(
              'DUPLICATE_FACE',
              'This face is already enrolled under a profile in this partition.',
              2
            );
          }
        }
      } finally {
        // Enforce memory hygiene: zero-wipe decrypted embeddings in RAM immediately
        wipeStoredEmbeddings(existingEmbeddings);
      }

      // Step 3: Generate Embedding
      Logger.info('EnrollmentManager', 'Running TFLite MobileFaceNet embedding generator...');
      const generatorResult = await generateEmbedding(faceFrame.base64jpeg);
      const embeddingVector = generatorResult.embedding;

      // Step 4: Serialize Embedding
      // Implicity verified inside the repository (serializeEmbedding converts Float32Array to Uint8Array)
      if (embeddingVector.length !== 128) {
        return this.failResult('INFERENCE_FAILED', 'Embedding generator yielded invalid vector coordinates.', 4);
      }

      // Step 5: Database Enrollment (Encrypts name, role, and vector blob)
      const userId = generateUUID();
      const enrolledAt = Date.now();
      const isoTimestamp = new Date(enrolledAt).toISOString();

      Logger.info('EnrollmentManager', `Saving encrypted profile to SQLite (ID: ${userId})...`);
      await userRepository.enrollUser({
        userId,
        name: input.name.trim(),
        role: input.role,
        partition: input.partition,
        embedding: embeddingVector,
        enrolledAt: isoTimestamp,
      });

      const elapsed = Date.now() - startTime;
      Logger.info('EnrollmentManager', `Enrollment sequence completed successfully in ${elapsed}ms.`);

      // Step 6: Return success
      return {
        success: true,
        userId,
        name: input.name.trim(),
        enrolledAt,
        reason: null,
        step: null,
      };
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      Logger.error('EnrollmentManager', `Pipeline exception after ${elapsed}ms`, error);
      
      return {
        success: false,
        userId: null,
        name: null,
        enrolledAt: null,
        reason: error.message || 'UNEXPECTED_SYSTEM_FAILURE',
        step: 5, // Mark as database/execution stage failure
      };
    }
  }

  /**
   * Helper to format failed result objects.
   */
  private failResult(
    reason: string,
    message: string,
    step: number
  ): EnrollmentResult {
    Logger.warn('EnrollmentManager', `Step ${step} failed: [${reason}] ${message}`);
    return {
      success: false,
      userId: null,
      name: null,
      enrolledAt: null,
      reason,
      step,
    };
  }
}

export const enrollmentManager = EnrollmentManager.getInstance();
export { EnrollmentManager };
