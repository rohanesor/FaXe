import { AlignedFaceFrame } from '../../types/camera';
import { LivenessResult } from '../../types/liveness';
import { checkPassiveLiveness } from './PassiveLivenessChecker';
import { ActiveLivenessChallenge, checkEyesOpen } from './ActiveLivenessChallenge';

export { checkPassiveLiveness } from './PassiveLivenessChecker';
export { ActiveLivenessChallenge, checkEyesOpen } from './ActiveLivenessChallenge';

/**
 * Runs the biometric liveness detection check:
 * 1. Executes the passive texture check first (Local Binary Patterns variance analysis).
 * 2. If the passive check fails (confidence indicates a printed page or spoof screen),
 *    immediately cancels and returns a spoof suspected result.
 * 3. If the passive check passes, runs the active challenges callback and returns the result.
 */
export async function runLivenessCheck(
  getFaceFrame: () => AlignedFaceFrame,
  runActiveChecks?: () => Promise<LivenessResult>
): Promise<LivenessResult> {
  console.log('[Liveness index] Initializing liveness pipeline checks...');
  
  const faceFrame = getFaceFrame();
  const passive = await checkPassiveLiveness(faceFrame);

  // If passive liveness is low (variance indicates spoof screen/print)
  if (!passive.isLive && passive.confidence > 0.6) {
    console.log('[Liveness index] Passive liveness check failed. Spoof suspected.');
    return {
      passed: false,
      score: passive.variance / 100,
      challengeResults: [],
      reason: 'spoof_suspected',
    };
  }

  console.log('[Liveness index] Passive check passed.');

  if (!runActiveChecks) {
    return {
      passed: true,
      score: passive.confidence,
      challengeResults: [],
      reason: 'success',
    };
  }

  console.log('[Liveness index] Proceeding to active verification challenges.');
  const activeResult = await runActiveChecks();
  return activeResult;
}

