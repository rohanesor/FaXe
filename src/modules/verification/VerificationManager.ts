import { AlignedFaceFrame } from '../../types/camera';
import { LivenessResult } from '../../types/liveness';
import { VerificationOutcome, VerificationResult } from '../../types/verification';
import { enrollmentRepository } from '../database/EnrollmentRepository';
import { userRepository, authLogRepository, wipeStoredEmbeddings } from '../database';
import { FaceEmbeddingService } from '../recognition/FaceEmbeddingService';
import { FaceMatcher } from '../recognition/FaceMatcher';
import { Logger } from '../../utils/logger';

/**
 * Phase 7 - Verification Flow.
 * Orchestrates the end-to-end real biometric verification flow.
 */
class VerificationManager {
  private static instance: VerificationManager;

  private constructor() {}

  public static getInstance(): VerificationManager {
    if (!VerificationManager.instance) {
      VerificationManager.instance = new VerificationManager();
    }
    return VerificationManager.instance;
  }

  /**
   * Processes a live frame, runs liveness, generates embedding, matches against enrolled templates,
   * logs the results to SQLite, and returns the verification outcome.
   */
  public async verifyUser(
    faceFrame: AlignedFaceFrame,
    livenessResult: LivenessResult,
    partition: string
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      // 1. Liveness check verification
      if (!livenessResult.passed) {
        Logger.warn('VerificationManager', 'Liveness check failed.');
        
        await authLogRepository.logAuthAttempt({
          userId: 'spoof_attempt',
          result: 'spoof',
          confidence: 0.0,
          livenessScore: livenessResult.score,
          outcome: VerificationOutcome.SPOOF_DETECTED,
        });

        return {
          outcome: VerificationOutcome.SPOOF_DETECTED,
          userId: null,
          userName: null,
          role: null,
          confidence: 0.0,
          livenessScore: livenessResult.score,
          pipelineTimeMs: Date.now() - startTime,
          message: 'Liveness check failed. Spoof suspected.',
        };
      }

      // 2. Load enrolled templates for active partition
      const candidates = await enrollmentRepository.getCandidates(partition);
      if (candidates.length === 0) {
        Logger.warn('VerificationManager', `No enrolled profiles in partition: ${partition}`);

        await authLogRepository.logAuthAttempt({
          userId: 'unknown',
          result: 'failure',
          confidence: 0.0,
          livenessScore: livenessResult.score,
          outcome: VerificationOutcome.NO_USERS_ENROLLED,
        });

        return {
          outcome: VerificationOutcome.NO_USERS_ENROLLED,
          userId: null,
          userName: null,
          role: null,
          confidence: null,
          livenessScore: livenessResult.score,
          pipelineTimeMs: Date.now() - startTime,
          message: 'No users have been enrolled in this partition.',
        };
      }

      // 3. Generate live embedding via TFLite Model
      console.log('[VerificationManager] Generating live embedding...');
      const liveEmbedding = await FaceEmbeddingService.generateEmbedding(faceFrame.base64jpeg);

      // 4. Match using Cosine Similarity matching engine
      console.log('[VerificationManager] Matching embedding against enrolled candidates...');
      const matchResult = FaceMatcher.match(liveEmbedding, candidates);

      // Wipe decrypted template embeddings from RAM immediately for security
      wipeStoredEmbeddings(candidates);

      const duration = Date.now() - startTime;

      if (!matchResult.matched) {
        Logger.warn('VerificationManager', `Biometric match failed. Confidence: ${matchResult.confidence}`);

        await authLogRepository.logAuthAttempt({
          userId: 'unknown',
          result: 'failure',
          confidence: matchResult.confidence,
          livenessScore: livenessResult.score,
          outcome: VerificationOutcome.NOT_RECOGNIZED,
        });

        return {
          outcome: VerificationOutcome.NOT_RECOGNIZED,
          userId: null,
          userName: null,
          role: null,
          confidence: matchResult.confidence,
          livenessScore: livenessResult.score,
          pipelineTimeMs: duration,
          message: 'Biometric verification failed. Face does not match registered profiles.',
        };
      }

      // 5. Success: Find matched user metadata in SQLite
      Logger.info('VerificationManager', `Biometric match verified for user: ${matchResult.userId}`);
      const allUsers = await userRepository.getUsersByPartition(partition);
      const matchedUser = allUsers.find((u) => u.id === matchResult.userId);

      if (!matchedUser) {
        throw new Error(`Matched user ID ${matchResult.userId} metadata not found in SQLite.`);
      }

      // Update last seen
      await userRepository.updateLastSeen(matchedUser.id);

      // Log successful verification
      await authLogRepository.logAuthAttempt({
        userId: matchedUser.id,
        result: 'success',
        confidence: matchResult.confidence,
        livenessScore: livenessResult.score,
        outcome: VerificationOutcome.VERIFIED,
      });

      console.log(`[VerificationManager] Verification succeeded in ${duration}ms (confidence: ${matchResult.confidence})`);

      return {
        outcome: VerificationOutcome.VERIFIED,
        userId: matchedUser.id,
        userName: matchedUser.name,
        role: matchedUser.role,
        confidence: matchResult.confidence,
        livenessScore: livenessResult.score,
        pipelineTimeMs: duration,
        message: null,
      };

    } catch (error: any) {
      Logger.error('VerificationManager', 'Unexpected verification pipeline exception', error);
      return {
        outcome: VerificationOutcome.ERROR,
        userId: null,
        userName: null,
        role: null,
        confidence: null,
        livenessScore: livenessResult.score || 0.0,
        pipelineTimeMs: Date.now() - startTime,
        message: error.message || 'An unexpected biometric pipeline error occurred.',
      };
    }
  }
}

export const verificationManager = VerificationManager.getInstance();
export { VerificationManager };
