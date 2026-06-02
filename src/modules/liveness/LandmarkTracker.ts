export interface Landmark {
  x: number;
  y: number;
}

export class LandmarkTracker {
  private history: Landmark[][] = [];
  private readonly maxFrames = 15;
  private baselineNose: Landmark | null = null;
  private baselineMouthWidth: number | null = null;

  public addFrame(landmarks: Landmark[]) {
    if (!landmarks || landmarks.length < 5) return;

    this.history.push(landmarks);
    if (this.history.length > this.maxFrames) {
      this.history.shift();
    }

    // Set baselines on first frame
    if (!this.baselineNose && landmarks[2]) {
      this.baselineNose = { ...landmarks[2] };
    }
    if (this.baselineMouthWidth === null && landmarks[3] && landmarks[4]) {
      this.baselineMouthWidth = this.computeDistance(landmarks[3], landmarks[4]);
    }
  }

  public getEAR(): number {
    if (this.history.length === 0) return 0.35;
    const latest = this.history[this.history.length - 1];

    // If simulator embeds eyelid aspect ratios in indices 6 & 7:
    if (latest[6] !== undefined && latest[7] !== undefined) {
      return (latest[6].y + latest[7].y) / 2;
    }

    // Standard fallback EAR (neutral)
    return 0.35;
  }

  public getMouthRatio(): number {
    if (this.history.length === 0 || !this.baselineMouthWidth) return 1.0;
    const latest = this.history[this.history.length - 1];
    
    if (!latest[3] || !latest[4]) return 1.0;
    const currentMouthWidth = this.computeDistance(latest[3], latest[4]);
    
    return currentMouthWidth / this.baselineMouthWidth;
  }

  public getNoseDelta(): { x: number; y: number } {
    if (this.history.length === 0 || !this.baselineNose) return { x: 0, y: 0 };
    const latest = this.history[this.history.length - 1];
    
    if (!latest[2]) return { x: 0, y: 0 };
    return {
      x: latest[2].x - this.baselineNose.x,
      y: latest[2].y - this.baselineNose.y,
    };
  }

  public getFaceDimensions(): { width: number; height: number } {
    if (this.history.length === 0) return { width: 1, height: 1 };
    const latest = this.history[this.history.length - 1];

    const eyeWidth = latest[0] && latest[1] ? this.computeDistance(latest[0], latest[1]) : 100;
    
    let faceHeight = eyeWidth * 1.5; // proxy height
    if (latest[0] && latest[1] && latest[5]) {
      const midEyeY = (latest[0].y + latest[1].y) / 2;
      faceHeight = Math.abs(latest[5].y - midEyeY);
    }

    return {
      width: eyeWidth,
      height: faceHeight,
    };
  }

  public getHistory(): Landmark[][] {
    return this.history;
  }

  public reset() {
    this.history = [];
    this.baselineNose = null;
    this.baselineMouthWidth = null;
  }

  private computeDistance(p1: Landmark, p2: Landmark): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }
}
