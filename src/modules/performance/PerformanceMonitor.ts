import { storage } from '../../store';
import { Logger } from '../../utils/logger';

export interface PerfEvent {
  type: 'enrollment' | 'verification';
  pipelineTimeMs: number;
  inferenceTimeMs?: number;
  livenessPassed: boolean;
  isVerified?: boolean; // For verification: true if matched and resolved
}

export interface PerfSummary {
  avgEnrollmentTimeMs: number;
  avgVerificationTimeMs: number;
  avgInferenceTimeMs: number;
  livenessPassRate: number; // percentage (0 - 100)
  recognitionAccuracy: number; // percentage (0 - 100)
  totalSessionEnrollments: number;
  totalSessionVerifications: number;
}

interface RawMetrics extends PerfSummary {
  sumEnrollmentTimeMs: number;
  sumVerificationTimeMs: number;
  sumInferenceTimeMs: number;
  inferenceCount: number;
  livenessPassedCount: number;
  livenessTotalCount: number;
  verificationSuccessCount: number;
}

const DEFAULT_METRICS: RawMetrics = {
  avgEnrollmentTimeMs: 0,
  avgVerificationTimeMs: 0,
  avgInferenceTimeMs: 0,
  livenessPassRate: 100,
  recognitionAccuracy: 100,
  totalSessionEnrollments: 0,
  totalSessionVerifications: 0,
  sumEnrollmentTimeMs: 0,
  sumVerificationTimeMs: 0,
  sumInferenceTimeMs: 0,
  inferenceCount: 0,
  livenessPassedCount: 0,
  livenessTotalCount: 0,
  verificationSuccessCount: 0,
};

/**
 * Persistently monitors processing benchmarks, model latencies, and scan ratios.
 */
class PerformanceMonitor {
  private static instance: PerformanceMonitor;

  private constructor() {}

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Retrieves raw metrics state from MMKV.
   */
  private getRawMetrics(): RawMetrics {
    try {
      const dataStr = storage.getString('perf_metrics');
      if (!dataStr) {
        return { ...DEFAULT_METRICS };
      }
      return JSON.parse(dataStr);
    } catch {
      return { ...DEFAULT_METRICS };
    }
  }

  /**
   * Saves updated metrics state to MMKV.
   */
  private saveRawMetrics(metrics: RawMetrics): void {
    storage.set('perf_metrics', JSON.stringify(metrics));
  }

  /**
   * Records a biometric action event and updates rolling averages.
   */
  public record(event: PerfEvent): void {
    const metrics = this.getRawMetrics();

    // 1. Liveness check updates
    metrics.livenessTotalCount++;
    if (event.livenessPassed) {
      metrics.livenessPassedCount++;
    }
    metrics.livenessPassRate = Math.round(
      (metrics.livenessPassedCount / metrics.livenessTotalCount) * 100
    );

    // 2. Inference time updates
    if (event.inferenceTimeMs !== undefined && event.inferenceTimeMs > 0) {
      metrics.sumInferenceTimeMs += event.inferenceTimeMs;
      metrics.inferenceCount++;
      metrics.avgInferenceTimeMs = Math.round(
        metrics.sumInferenceTimeMs / metrics.inferenceCount
      );
    }

    // 3. Pipeline specific updates
    if (event.type === 'enrollment') {
      metrics.totalSessionEnrollments++;
      metrics.sumEnrollmentTimeMs += event.pipelineTimeMs;
      metrics.avgEnrollmentTimeMs = Math.round(
        metrics.sumEnrollmentTimeMs / metrics.totalSessionEnrollments
      );
    } else if (event.type === 'verification') {
      metrics.totalSessionVerifications++;
      metrics.sumVerificationTimeMs += event.pipelineTimeMs;
      metrics.avgVerificationTimeMs = Math.round(
        metrics.sumVerificationTimeMs / metrics.totalSessionVerifications
      );

      if (event.isVerified) {
        metrics.verificationSuccessCount++;
      }
      metrics.recognitionAccuracy = Math.round(
        (metrics.verificationSuccessCount / metrics.totalSessionVerifications) * 100
      );
    }

    this.saveRawMetrics(metrics);
    Logger.info(
      'PerformanceMonitor',
      `Perf event logged: ${event.type}. Latency: ${event.pipelineTimeMs}ms. Rolling Inference: ${metrics.avgInferenceTimeMs}ms.`
    );
  }

  /**
   * Exposes clean statistics summary (excluding raw sums).
   */
  public getSummary(): PerfSummary {
    const metrics = this.getRawMetrics();
    return {
      avgEnrollmentTimeMs: metrics.avgEnrollmentTimeMs,
      avgVerificationTimeMs: metrics.avgVerificationTimeMs,
      avgInferenceTimeMs: metrics.avgInferenceTimeMs,
      livenessPassRate: metrics.livenessPassRate,
      recognitionAccuracy: metrics.recognitionAccuracy,
      totalSessionEnrollments: metrics.totalSessionEnrollments,
      totalSessionVerifications: metrics.totalSessionVerifications,
    };
  }

  /**
   * Resets rolling performance aggregates.
   */
  public reset(): void {
    this.saveRawMetrics({ ...DEFAULT_METRICS });
    Logger.info('PerformanceMonitor', 'Session performance metrics have been reset.');
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
export { PerformanceMonitor };
