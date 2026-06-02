import { ChallengeType, ChallengeResult, LivenessResult } from '../../types/liveness';
import { Landmark } from './LandmarkTracker';
import { ChallengeDetector } from './ChallengeDetector';

export class LivenessOrchestrator {
  private challenges: ChallengeType[] = [];
  private currentIdx = 0;
  private results: ChallengeResult[] = [];
  private detector = new ChallengeDetector();
  private challengeStartTime = 0;

  public startSession(): ChallengeType[] {
    const list = [
      ChallengeType.BLINK,
      ChallengeType.SMILE,
      ChallengeType.TURN_LEFT,
      ChallengeType.TURN_RIGHT,
      ChallengeType.NOD,
    ];

    const shuffled = [...list].sort(() => 0.5 - Math.random());
    this.challenges = shuffled.slice(0, 2);
    
    this.currentIdx = 0;
    this.results = [];
    this.detector.reset();
    this.challengeStartTime = Date.now();

    console.log('[LivenessOrchestrator] Starting Liveness Session:', this.challenges);
    return this.challenges;
  }

  public getCurrentChallenge(): ChallengeType | null {
    if (this.currentIdx >= this.challenges.length) return null;
    return this.challenges[this.currentIdx];
  }

  public getProgressText(): string {
    return `Challenge ${this.currentIdx + 1} of ${this.challenges.length}`;
  }

  public feedLandmarks(landmarks: Landmark[]): { passed: boolean; completed: boolean; result?: LivenessResult } {
    const challenge = this.getCurrentChallenge();
    if (!challenge) {
      return { passed: false, completed: true, result: this.compileFinalResult() };
    }

    const elapsed = Date.now() - this.challengeStartTime;
    
    if (elapsed > 4000) {
      console.log(`[LivenessOrchestrator] Challenge ${challenge} timed out.`);
      this.recordChallengeResult(challenge, false, 0, elapsed);
      return this.advanceOrComplete();
    }

    let detection = { detected: false, confidence: 0 };
    switch (challenge) {
      case ChallengeType.BLINK:
        detection = this.detector.detectBlink(landmarks);
        break;
      case ChallengeType.SMILE:
        detection = this.detector.detectSmile(landmarks);
        break;
      case ChallengeType.TURN_LEFT:
        detection = this.detector.detectTurnLeft(landmarks);
        break;
      case ChallengeType.TURN_RIGHT:
        detection = this.detector.detectTurnRight(landmarks);
        break;
      case ChallengeType.NOD:
        detection = this.detector.detectNod(landmarks);
        break;
    }

    if (detection.detected) {
      console.log(`[LivenessOrchestrator] Challenge ${challenge} passed with confidence ${detection.confidence}!`);
      this.recordChallengeResult(challenge, true, detection.confidence, elapsed);
      return this.advanceOrComplete();
    }

    return { passed: false, completed: false };
  }

  private recordChallengeResult(challenge: ChallengeType, passed: boolean, confidence: number, durationMs: number) {
    this.results.push({
      challenge,
      passed,
      confidence,
      durationMs,
    });
  }

  private advanceOrComplete(): { passed: boolean; completed: boolean; result?: LivenessResult } {
    this.currentIdx++;
    this.detector.reset();
    this.challengeStartTime = Date.now();

    if (this.currentIdx >= this.challenges.length) {
      const finalResult = this.compileFinalResult();
      return { passed: finalResult.passed, completed: true, result: finalResult };
    }

    return { passed: true, completed: false };
  }

  private compileFinalResult(): LivenessResult {
    const totalChallenges = this.results.length;
    const passes = this.results.filter(r => r.passed);
    const passCount = passes.length;

    const passed = passCount === totalChallenges;
    
    const totalConfidence = passes.reduce((sum, r) => sum + r.confidence, 0);
    const score = passCount > 0 ? (totalConfidence / totalChallenges) : 0;

    let reason: 'success' | 'spoof_suspected' | 'timeout' = 'success';
    if (passCount === 0) {
      reason = 'spoof_suspected';
    } else if (passCount < totalChallenges) {
      reason = 'timeout';
    }

    const finalResult: LivenessResult = {
      passed,
      score,
      challengeResults: this.results,
      reason,
    };

    console.log('[LivenessOrchestrator] Finalizing Liveness Session:', finalResult);
    return finalResult;
  }
}
