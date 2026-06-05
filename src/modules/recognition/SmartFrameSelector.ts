export interface ScoredFrame {
  base64jpeg: string;
  blurScore: number;
  yaw: number;
  pitch: number;
  timestamp: number;
}

export class SmartFrameSelector {
  // Map of pose bins to their best captured frame (highest blur score)
  private bins: {
    front: ScoredFrame | null;
    left: ScoredFrame | null;
    right: ScoredFrame | null;
    up: ScoredFrame | null;
    down: ScoredFrame | null;
  } = {
    front: null,
    left: null,
    right: null,
    up: null,
    down: null,
  };

  private allFrames: ScoredFrame[] = [];

  public reset(): void {
    this.bins = {
      front: null,
      left: null,
      right: null,
      up: null,
      down: null,
    };
    this.allFrames = [];
  }

  /**
   * Evaluates and potentially adds a new frame.
   * Categorizes the frame into one of the 5 pose bins based on its yaw/pitch asymmetry.
   * If the new frame is sharper than the existing frame in its bin, it replaces it.
   */
  public addFrame(frame: ScoredFrame): void {
    this.allFrames.push(frame);

    const YAW_BIN_THRESHOLD = 0.04;
    const PITCH_BIN_THRESHOLD = 0.04;

    let binKey: 'front' | 'left' | 'right' | 'up' | 'down' = 'front';

    if (Math.abs(frame.yaw) > Math.abs(frame.pitch)) {
      if (frame.yaw > YAW_BIN_THRESHOLD) {
        binKey = 'left';
      } else if (frame.yaw < -YAW_BIN_THRESHOLD) {
        binKey = 'right';
      }
    } else {
      if (frame.pitch > PITCH_BIN_THRESHOLD) {
        binKey = 'up';
      } else if (frame.pitch < -PITCH_BIN_THRESHOLD) {
        binKey = 'down';
      }
    }

    const currentBest = this.bins[binKey];
    if (!currentBest || frame.blurScore > currentBest.blurScore) {
      console.log(`[SmartFrameSelector] Saved frame to bin: ${binKey.toUpperCase()} (Sharpness: ${frame.blurScore.toFixed(0)})`);
      this.bins[binKey] = frame;
    }
  }

  /**
   * Returns up to 5 best frames.
   * If we have frames in the designated bins, we return those.
   * If some bins are empty, we fall back to backfilling with the next sharpest frames overall.
   */
  public getBestFrames(): ScoredFrame[] {
    const selected: ScoredFrame[] = [];

    // Collect from bins
    for (const key of ['front', 'left', 'right', 'up', 'down'] as const) {
      const f = this.bins[key];
      if (f) selected.push(f);
    }

    // If we have fewer than 3 frames (e.g. user stayed completely static),
    // backfill from all captured frames sorted by sharpness
    if (selected.length < 3 && this.allFrames.length > 0) {
      const sortedAll = [...this.allFrames].sort((a, b) => b.blurScore - a.blurScore);
      for (const f of sortedAll) {
        if (!selected.some(s => s.base64jpeg === f.base64jpeg)) {
          selected.push(f);
          if (selected.length >= 5) break;
        }
      }
    }

    return selected.slice(0, 5);
  }

  /**
   * Returns true if we have successfully collected at least 3 distinct pose bins.
   */
  public hasSufficientPoses(): boolean {
    let count = 0;
    for (const key of ['front', 'left', 'right', 'up', 'down'] as const) {
      if (this.bins[key] !== null) count++;
    }
    return count >= 3;
  }

  public getUniqueBinCount(): number {
    let count = 0;
    for (const key of ['front', 'left', 'right', 'up', 'down'] as const) {
      if (this.bins[key] !== null) count++;
    }
    return count;
  }
}
