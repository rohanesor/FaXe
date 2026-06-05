import { Images } from 'react-native-nitro-image';
import { modelManager } from './ModelManager';

export interface Anchor {
  x_center: number;
  y_center: number;
  w: number;
  h: number;
}

export interface FaceDetectionResult {
  boundingBox: {
    x: number; // [0, 1] relative to width
    y: number; // [0, 1] relative to height
    width: number; // [0, 1] relative to width
    height: number; // [0, 1] relative to height
  };
  landmarks: {
    x: number;
    y: number;
  }[]; // 6 points: [right eye, left eye, nose, mouth, right ear, left ear]
  score: number;
}

/**
 * Generates the 896 static anchor boxes for BlazeFace.
 */
export function generateBlazeFaceAnchors(): Anchor[] {
  const anchors: Anchor[] = [];
  const minScale = 0.1484375;
  const maxScale = 0.75;
  const inputSizeWidth = 128;
  const inputSizeHeight = 128;
  const anchorOffsetX = 0.5;
  const anchorOffsetY = 0.5;
  const strides = [8, 16, 16, 16];
  const numLayers = 4;
  const aspectRatios = [1.0];
  const interpolatedScaleAspectRatio = 1.0;
  const fixedAnchorSize = true;

  let layerId = 0;
  while (layerId < numLayers) {
    const layerScales: number[] = [];
    const layerAspectRatios: number[] = [];

    let lastSameStrideLayer = layerId;
    while (
      lastSameStrideLayer < strides.length &&
      strides[lastSameStrideLayer] === strides[layerId]
    ) {
      const scale = minScale + (maxScale - minScale) * lastSameStrideLayer / (numLayers - 1);
      
      for (const ratio of aspectRatios) {
        layerAspectRatios.push(ratio);
        layerScales.push(scale);
      }

      if (interpolatedScaleAspectRatio > 0) {
        const scaleNext =
          lastSameStrideLayer === numLayers - 1
            ? 1.0
            : minScale + (maxScale - minScale) * (lastSameStrideLayer + 1) / (numLayers - 1);
        layerScales.push(Math.sqrt(scale * scaleNext));
        layerAspectRatios.push(interpolatedScaleAspectRatio);
      }
      lastSameStrideLayer++;
    }

    const stride = strides[layerId];
    const featureMapHeight = Math.ceil(inputSizeHeight / stride);
    const featureMapWidth = Math.ceil(inputSizeWidth / stride);

    for (let y = 0; y < featureMapHeight; y++) {
      for (let x = 0; x < featureMapWidth; x++) {
        for (let i = 0; i < layerScales.length; i++) {
          const x_center = (x + anchorOffsetX) / featureMapWidth;
          const y_center = (y + anchorOffsetY) / featureMapHeight;
          
          let w = 1.0;
          let h = 1.0;
          if (!fixedAnchorSize) {
            const ratioSqrt = Math.sqrt(layerAspectRatios[i]);
            h = layerScales[i] / ratioSqrt;
            w = layerScales[i] * ratioSqrt;
          }
          anchors.push({ x_center, y_center, w, h });
        }
      }
    }
    layerId = lastSameStrideLayer;
  }
  return anchors;
}

// Pre-compute anchors array
const BLAZEFACE_ANCHORS = generateBlazeFaceAnchors();

/**
 * Decodes a base64-encoded string into a binary Uint8Array.
 */
function decodeBase64(base64Str: string): Uint8Array {
  const cleanBase64 = base64Str.replace(/^data:image\/[a-z]+;base64,/, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < alphabet.length; i++) {
    lookup[alphabet.charCodeAt(i)] = i;
  }
  let padding = 0;
  if (cleanBase64.endsWith('==')) {
    padding = 2;
  } else if (cleanBase64.endsWith('=')) {
    padding = 1;
  }
  const outputLength = (cleanBase64.length * 3) / 4 - padding;
  const bytes = new Uint8Array(outputLength);
  let byteIndex = 0;
  for (let i = 0; i < cleanBase64.length; i += 4) {
    const code0 = lookup[cleanBase64.charCodeAt(i)] || 0;
    const code1 = lookup[cleanBase64.charCodeAt(i + 1)] || 0;
    const code2 = lookup[cleanBase64.charCodeAt(i + 2)] || 0;
    const code3 = lookup[cleanBase64.charCodeAt(i + 3)] || 0;
    bytes[byteIndex++] = (code0 << 2) | (code1 >> 4);
    if (byteIndex < outputLength) {
      bytes[byteIndex++] = ((code1 & 15) << 4) | (code2 >> 2);
    }
    if (byteIndex < outputLength) {
      bytes[byteIndex++] = ((code2 & 3) << 6) | code3;
    }
  }
  return bytes;
}

function sigmoid(x: number): number {
  return 1.0 / (1.0 + Math.exp(-x));
}

function calculateIoU(box1: any, box2: any): number {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

  const intersectionArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area1 = box1.width * box1.height;
  const area2 = box2.width * box2.height;
  const unionArea = area1 + area2 - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

function nonMaximumSuppression(detections: FaceDetectionResult[], iouThreshold: number): FaceDetectionResult[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const keep: FaceDetectionResult[] = [];
  const active = new Array(sorted.length).fill(true);

  for (let i = 0; i < sorted.length; i++) {
    if (!active[i]) continue;
    const current = sorted[i];
    keep.push(current);
    for (let j = i + 1; j < sorted.length; j++) {
      if (!active[j]) continue;
      if (calculateIoU(current.boundingBox, sorted[j].boundingBox) > iouThreshold) {
        active[j] = false;
      }
    }
  }

  return keep;
}

export class BlazeFaceDetector {
  /**
   * Run BlazeFace detection on a base64 JPEG frame.
   * Resizes image to 128x128, extracts RGB pixel float values, runs model, and decodes.
   */
  public static async detect(base64Jpeg: string, scoreThreshold = 0.65): Promise<FaceDetectionResult[]> {
    const size = 128;
    const cleanBase64 = base64Jpeg.replace(/^data:image\/[a-z]+;base64,/, '').split('#')[0];
    const jpegBytes = decodeBase64(cleanBase64);

    // 1. native image decoding & resize
    const nativeImage = await Images.loadFromEncodedImageDataAsync({
      buffer: jpegBytes.buffer as ArrayBuffer,
      width: size,
      height: size,
      imageFormat: 'jpg',
    });

    const resizedImage = await nativeImage.resizeAsync(size, size);
    const rawPixelData = await resizedImage.toRawPixelDataAsync();
    const pixelView = new Uint8Array(rawPixelData.buffer);

    // 2. Map channels & normalize to [-1, 1]
    const inputFloats = new Float32Array(size * size * 3);
    const format = rawPixelData.pixelFormat;
    const isBGR = format.startsWith('BGR');
    const hasAlpha = format.length === 4 || format.endsWith('X') || format.startsWith('X');
    const bytesPerPixel = hasAlpha ? 4 : 3;

    let targetIdx = 0;
    for (let i = 0; i < pixelView.length; i += bytesPerPixel) {
      if (targetIdx >= inputFloats.length) break;

      let r = 0, g = 0, b = 0;
      if (format === 'ARGB') {
        r = pixelView[i + 1];
        g = pixelView[i + 2];
        b = pixelView[i + 3];
      } else if (format === 'ABGR') {
        b = pixelView[i + 1];
        g = pixelView[i + 2];
        r = pixelView[i + 3];
      } else if (isBGR) {
        b = pixelView[i];
        g = pixelView[i + 1];
        r = pixelView[i + 2];
      } else {
        r = pixelView[i];
        g = pixelView[i + 1];
        b = pixelView[i + 2];
      }

      inputFloats[targetIdx++] = (r - 127.5) / 127.5;
      inputFloats[targetIdx++] = (g - 127.5) / 127.5;
      inputFloats[targetIdx++] = (b - 127.5) / 127.5;
    }

    // 3. Run TFLite Inference
    const model = modelManager.getDetectorModel();
    const outputs = await model.run([inputFloats.buffer as ArrayBuffer]);

    let rawBoxes: Float32Array;
    let rawScores: Float32Array;

    if (outputs[0].byteLength === 57344) {
      rawBoxes = new Float32Array(outputs[0]);
      rawScores = new Float32Array(outputs[1]);
    } else if (outputs[1].byteLength === 57344) {
      rawBoxes = new Float32Array(outputs[1]);
      rawScores = new Float32Array(outputs[0]);
    } else {
      console.warn(`[BlazeFaceDetector] UNEXPECTED OUTPUT SIZES: outputs[0]=${outputs[0].byteLength}, outputs[1]=${outputs[1].byteLength}`);
      rawBoxes = new Float32Array(outputs[0]);
      rawScores = new Float32Array(outputs[1]);
    }



    const detections: FaceDetectionResult[] = [];

    // 4. Decode 896 candidate anchors
    for (let i = 0; i < 896; i++) {
      const rawScore = rawScores[i];
      const score = sigmoid(rawScore);

      if (score > scoreThreshold) {
        const anchor = BLAZEFACE_ANCHORS[i];

        const dx = rawBoxes[i * 16 + 0];
        const dy = rawBoxes[i * 16 + 1];
        const dw = rawBoxes[i * 16 + 2];
        const dh = rawBoxes[i * 16 + 3];

        // Decoded box centers & size in [0, 1] normalized coordinates
        const x_center = (dx / 128.0) * anchor.w + anchor.x_center;
        const y_center = (dy / 128.0) * anchor.h + anchor.y_center;
        const width = (dw / 128.0) * anchor.w;
        const height = (dh / 128.0) * anchor.h;

        const xmin = Math.max(0, x_center - width / 2);
        const ymin = Math.max(0, y_center - height / 2);
        const boxWidth = Math.min(1.0 - xmin, width);
        const boxHeight = Math.min(1.0 - ymin, height);

        // Decode 6 facial keypoints
        const landmarks = [];
        for (let j = 0; j < 6; j++) {
          const l_dx = rawBoxes[i * 16 + 4 + j * 2];
          const l_dy = rawBoxes[i * 16 + 4 + j * 2 + 1];

          const lx = (l_dx / 128.0) * anchor.w + anchor.x_center;
          const ly = (l_dy / 128.0) * anchor.h + anchor.y_center;
          landmarks.push({ x: lx, y: ly });
        }

        detections.push({
          boundingBox: {
            x: xmin,
            y: ymin,
            width: boxWidth,
            height: boxHeight,
          },
          landmarks,
          score,
        });
      }
    }

    // 5. Apply Non-Maximum Suppression (IoU limit 0.3)
    return nonMaximumSuppression(detections, 0.3);
  }
}
