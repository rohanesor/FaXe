export enum ChallengeType {
  BLINK = 'BLINK',
  SMILE = 'SMILE',
  TURN_LEFT = 'TURN_LEFT',
  TURN_RIGHT = 'TURN_RIGHT',
  NOD = 'NOD',
}

export interface ChallengeResult {
  challenge: ChallengeType;
  passed: boolean;
  confidence: number;
  durationMs: number;
}

export interface LivenessResult {
  passed: boolean;
  score: number; // 0 to 1
  challengeResults: ChallengeResult[];
  reason: 'success' | 'spoof_suspected' | 'timeout';
}
