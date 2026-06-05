import { modelManager } from './ModelManager';
import { FacePreprocessor } from './FacePreprocessor';

/**
 * Phase 3 - Face Embedding Generation Service.
 * Accepts preprocessed Float32 pixel tensor and generates a 128-D normalized embedding vector.
 */
export class FaceEmbeddingService {
  public static async generateEmbedding(base64Jpeg: string): Promise<Float32Array> {
    if (!modelManager.isReady()) {
      await modelManager.loadModel();
    }
    const model = modelManager.getModel();

    // 1. Get preprocessed Float32 pixel tensor
    const normalizedFloats = await FacePreprocessor.preprocess(base64Jpeg);
    
    // 2. Load bytes into model input buffer
    let inputBuffer: ArrayBufferLike = normalizedFloats.buffer;
    let outputBuffers: ArrayBuffer[];

    try {
      // Execute fast-tflite JNI runtime inference (Float32 first)
      outputBuffers = await model.run([inputBuffer as ArrayBuffer]);
    } catch (runError) {
      console.warn('[FaceEmbeddingService] Float32 inference failed, trying INT8 quantized...');
      
      const targetPixelCount = 112 * 112 * 3;
      const quantizedInt8 = new Int8Array(targetPixelCount);
      for (let i = 0; i < targetPixelCount; i++) {
        quantizedInt8[i] = Math.round(normalizedFloats[i] * 127);
      }
      outputBuffers = await model.run([quantizedInt8.buffer as ArrayBuffer]);
    }

    if (!outputBuffers || outputBuffers.length === 0) {
      throw new Error('EMBEDDING_GENERATION_FAILED: Model returned no output tensors.');
    }

    // 3. Dequantize and extract embedding buffer
    const outputBuffer = outputBuffers[0];
    let embedding: Float32Array;

    if (outputBuffer.byteLength === 768) {
      // Float32 output tensor (192 dims)
      const alignedBuffer = new ArrayBuffer(768);
      new Uint8Array(alignedBuffer).set(new Uint8Array(outputBuffer));
      embedding = new Float32Array(alignedBuffer);
    } else if (outputBuffer.byteLength === 192) {
      // INT8 output tensor (192 dims): Dequantize back to Float32
      const int8View = new Int8Array(outputBuffer);
      embedding = new Float32Array(192);
      for (let i = 0; i < 192; i++) {
        embedding[i] = int8View[i] / 128.0;
      }
    } else if (outputBuffer.byteLength === 512) {
      // Float32 output tensor (128 dims)
      const alignedBuffer = new ArrayBuffer(512);
      new Uint8Array(alignedBuffer).set(new Uint8Array(outputBuffer));
      embedding = new Float32Array(alignedBuffer);
    } else if (outputBuffer.byteLength === 128) {
      // INT8 output tensor (128 dims): Dequantize back to Float32
      const int8View = new Int8Array(outputBuffer);
      embedding = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        embedding[i] = int8View[i] / 128.0;
      }
    } else {
      throw new Error(`INFERENCE_ERROR: Unexpected output tensor byte size: ${outputBuffer.byteLength}`);
    }

    // 4. L2-Normalization (Crucial for Cosine Similarity verification)
    let sumSquares = 0;
    const len = embedding.length;
    for (let i = 0; i < len; i++) {
      sumSquares += embedding[i] * embedding[i];
    }
    const magnitude = Math.sqrt(sumSquares);
    if (magnitude > 0 && Math.abs(magnitude - 1.0) > 1e-4) {
      for (let i = 0; i < len; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }
}
