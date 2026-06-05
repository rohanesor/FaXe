import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';

/**
 * Singleton Model Manager for initializing and loading the MobileFaceNet and BlazeFace models.
 */
export class ModelManager {
  private static instance: ModelManager;
  private model: TensorflowModel | null = null;
  private detectorModel: TensorflowModel | null = null;
  private isInitializing = false;

  private constructor() {}

  public static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  public async loadModel(): Promise<void> {
    if (this.model && this.detectorModel) return;
    if (this.isInitializing) {
      return;
    }
    this.isInitializing = true;
    try {
      console.log('[ModelManager] Loading MobileFaceNet INT8 model...');
      const modelSource = require('../../models/mobilefacenet_int8.tflite');
      this.model = await loadTensorflowModel(modelSource, []);
      console.log('[ModelManager] MobileFaceNet model loaded successfully.');

      console.log('[ModelManager] Loading BlazeFace Face Detector model...');
      const detectorSource = require('../../models/face_detection_short_range.tflite');
      this.detectorModel = await loadTensorflowModel(detectorSource, []);
      console.log('[ModelManager] BlazeFace Face Detector model loaded successfully.');
    } catch (error: any) {
      console.error('[ModelManager] Failed to initialize models:', error);
      throw new Error(`MODEL_LOAD_FAILED: ${error.message || error}`);
    } finally {
      this.isInitializing = false;
    }
  }

  public getModel(): TensorflowModel {
    if (!this.model) {
      throw new Error('MODEL_NOT_READY: TFLite model is not loaded. Call loadModel() first.');
    }
    return this.model;
  }

  public getDetectorModel(): TensorflowModel {
    if (!this.detectorModel) {
      throw new Error('DETECTOR_MODEL_NOT_READY: TFLite face detector model is not loaded. Call loadModel() first.');
    }
    return this.detectorModel;
  }

  public isReady(): boolean {
    return this.model !== null && this.detectorModel !== null;
  }
}

export const modelManager = ModelManager.getInstance();
