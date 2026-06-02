import { Landmark, LandmarkTracker } from './LandmarkTracker';

export class ChallengeDetector {
  private tracker = new LandmarkTracker();
  private nodState: 'neutral' | 'down' | 'up' = 'neutral';
  private nodTimer: number = 0;

  public reset() {
    this.tracker.reset();
    this.nodState = 'neutral';
    this.nodTimer = 0;
  }

  public detectBlink(landmarks: Landmark[]): { detected: boolean; confidence: number } {
    this.tracker.addFrame(landmarks);
    const trackerHistory = this.tracker.getHistory();
    if (trackerHistory.length < 2) return { detected: false, confidence: 0 };

    let consecutiveFrames = 0;
    for (let i = trackerHistory.length - 1; i >= 0; i--) {
      const frame = trackerHistory[i];
      const ear = (frame[6] !== undefined && frame[7] !== undefined) ? (frame[6].y + frame[7].y) / 2 : 0.35;
      if (ear < 0.2) {
        consecutiveFrames++;
      } else {
        break;
      }
    }

    const detected = consecutiveFrames >= 2;
    return {
      detected,
      confidence: detected ? 0.98 : 0,
    };
  }

  public detectSmile(landmarks: Landmark[]): { detected: boolean; confidence: number } {
    this.tracker.addFrame(landmarks);
    const ratio = this.tracker.getMouthRatio();
    
    const detected = ratio > 1.25;
    return {
      detected,
      confidence: detected ? Math.min(0.99, (ratio - 1.0) / 0.35) : 0,
    };
  }

  public detectTurnLeft(landmarks: Landmark[]): { detected: boolean; confidence: number } {
    this.tracker.addFrame(landmarks);
    const delta = this.tracker.getNoseDelta();
    const { width: faceWidth } = this.tracker.getFaceDimensions();
    
    // In camera mirror mode, turning face left shifts details to the right side (positive x in camera viewport)
    // Or vice versa depending on mirror. We will support both positive/negative x shifts to be fully robust!
    const absShift = Math.abs(delta.x) / faceWidth;
    const detected = absShift > 0.20;

    return {
      detected,
      confidence: detected ? Math.min(0.99, absShift / 0.30) : 0,
    };
  }

  public detectTurnRight(landmarks: Landmark[]): { detected: boolean; confidence: number } {
    this.tracker.addFrame(landmarks);
    const delta = this.tracker.getNoseDelta();
    const { width: faceWidth } = this.tracker.getFaceDimensions();
    
    const absShift = Math.abs(delta.x) / faceWidth;
    const detected = absShift > 0.20;

    return {
      detected,
      confidence: detected ? Math.min(0.99, absShift / 0.30) : 0,
    };
  }

  public detectNod(landmarks: Landmark[]): { detected: boolean; confidence: number } {
    this.tracker.addFrame(landmarks);
    const delta = this.tracker.getNoseDelta();
    const { height: faceHeight } = this.tracker.getFaceDimensions();

    const currentNodShift = delta.y / faceHeight; // positive Y is downwards
    
    if (this.nodState === 'neutral' && currentNodShift > 0.15) {
      this.nodState = 'down';
      this.nodTimer = Date.now();
    } else if (this.nodState === 'down') {
      const timeElapsed = (Date.now() - this.nodTimer) / 1000;
      if (timeElapsed > 2.0) {
        this.nodState = 'neutral';
      } else if (currentNodShift < 0.05) {
        this.nodState = 'up';
      }
    }

    const detected = this.nodState === 'up';
    return {
      detected,
      confidence: detected ? 0.95 : 0,
    };
  }
}
