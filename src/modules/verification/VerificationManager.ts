import { AlignedFaceFrame } from '../../types/camera';
import { LivenessResult } from '../../types/liveness';
import { VerificationOutcome, VerificationResult } from '../../types/verification';
import { userRepository, authLogRepository, wipeStoredEmbeddings } from '../database';
import { recognizeFace } from '../recognition';
import { Logger } from '../../utils/logger';

/**
 * Orchestrator managing the offline face verification pipeline.
 * Connects liveness results, face embedding comparison, audit logging, and RAM sanitation.
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
   * Evaluates a biometric scan against partition enrollment templates.
   * Logs outcomes, handles decryption cleanup, and measures pipeline latency.
   */
  public async verifyUser(
    faceFrame: AlignedFaceFrame,
    livenessResult: LivenessResult,
    partition: string
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      // Step 1: Check Liveness validation
      if (!livenessResult.passed) {
        Logger.warn('VerificationManager', 'Liveness check failed.');
        
        // Log spoof attempt in DB
        await authLogRepository.logAuthAttempt({
          userId: 'spoof_attempt',
          result: 'spoof',
          confidence: 0.0,
          livenessScore: livenessResult.score,
          outcome: VerificationOutcome.SPOOF_DETECTED,
        });

        const duration = Date.now() - startTime;
        return {
          outcome: VerificationOutcome.SPOOF_DETECTED,
          userId: null,
          userName: null,
          role: null,
          confidence: 0.0,
          livenessScore: livenessResult.score,
          pipelineTimeMs: duration,
          message: 'Liveness checking intercepted a spoof bypass attempt.',
        };
      }

      // Step 2: Fetch stored user embeddings for partition
      const candidates = await userRepository.getEmbeddingsForPartition(partition);
      if (candidates.length === 0) {
        Logger.warn('VerificationManager', `No enrolled operators in partition: ${partition}`);

        // Log search attempt failure due to zero population
        await authLogRepository.logAuthAttempt({
          userId: 'unknown',
          result: 'failure',
          confidence: 0.0,
          livenessScore: livenessResult.score,
          outcome: VerificationOutcome.NO_USERS_ENROLLED,
        });

        const duration = Date.now() - startTime;
        return {
          outcome: VerificationOutcome.NO_USERS_ENROLLED,
          userId: null,
          userName: null,
          role: null,
          confidence: null,
          livenessScore: livenessResult.score,
          pipelineTimeMs: duration,
          message: 'No users have been enrolled in this local partition.',
        };
      }

      // Step 3: Call match recognition algorithm
      const matchResult = await recognizeFace(faceFrame, candidates);

      // Step 4: If not recognized
      if (!matchResult.matched) {
        Logger.warn('VerificationManager', 'Biometric match failed.');

        // Wipe decrypted vector arrays from memory immediately
        wipeStoredEmbeddings(candidates);

        // Log failed attempt
        await authLogRepository.logAuthAttempt({
          userId: 'unknown',
          result: 'failure',
          confidence: matchResult.confidence,
          livenessScore: livenessResult.score,
          outcome: VerificationOutcome.NOT_RECOGNIZED,
        });

        const duration = Date.now() - startTime;
        return {
          outcome: VerificationOutcome.NOT_RECOGNIZED,
          userId: null,
          userName: null,
          role: null,
          confidence: matchResult.confidence,
          livenessScore: livenessResult.score,
          pipelineTimeMs: duration,
          message: 'Identity verification failed. Facial template does not match.',
        };
      }

      // Step 5: If recognized successfully
      Logger.info('VerificationManager', `Match verified for user ID: ${matchResult.userId}`);
      
      const allUsers = await userRepository.getUsersByPartition(partition);
      const matchedUser = allUsers.find((u) => u.id === matchResult.userId);

      // Wipe decrypted vectors from memory immediately
      wipeStoredEmbeddings(candidates);

      if (!matchedUser) {
        throw new Error(`Matched user ID ${matchResult.userId} metadata not found in SQLite.`);
      }

      // Update user's last seen timestamp
      await userRepository.updateLastSeen(matchedUser.id);

      // Log successful verification attempt
      await authLogRepository.logAuthAttempt({
        userId: matchedUser.id,
        result: 'success',
        confidence: matchResult.confidence,
        livenessScore: livenessResult.score,
        outcome: VerificationOutcome.VERIFIED,
      });

      const duration = Date.now() - startTime;
      Logger.info('VerificationManager', `Total verification process time: ${duration}ms`);

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
      Logger.error('VerificationManager', 'Unexpected verification exception', error);
      const duration = Date.now() - startTime;
      
      return {
        outcome: VerificationOutcome.ERROR,
        userId: null,
        userName: null,
        role: null,
        confidence: null,
        livenessScore: livenessResult.score || 0.0,
        pipelineTimeMs: duration,
        message: error.message || 'An unexpected biometric verification pipeline error occurred.',
      };
    }
  }
}

export const verificationManager = VerificationManager.getInstance();
export { VerificationManager };
