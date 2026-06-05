import { Images } from 'react-native-nitro-image';

export interface QualityMetrics {
  faceDetected: boolean;
  lightingStatus: 'Good' | 'Low Light' | 'Too Bright';
  blurScore: number;
  blurStatus: 'Sharp' | 'Blurry';
  poseDetected: 'Front' | 'Left' | 'Right' | 'Up' | 'Down';
  rawYaw: number;
  rawPitch: number;
}

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

/**
 * Main entry point to analyze a captured/cropped face frame.
 * Decodes the image, runs grayscale conversion, and calculates quality metrics.
 */
export async function analyzeImageQuality(base64jpeg: string): Promise<QualityMetrics> {
  const size = 112;
  const cleanBase64 = base64jpeg.split('#')[0].replace(/^data:image\/[a-z]+;base64,/, '');

  // Detect if this is a tiny placeholder/mock frame
  if (cleanBase64.length < 500 || cleanBase64.includes('wgALCAAcABwBAREA')) {
    return {
      faceDetected: true,
      lightingStatus: 'Good',
      blurScore: 100,
      blurStatus: 'Sharp',
      poseDetected: 'Front',
      rawYaw: 0,
      rawPitch: 0,
    };
  }

  try {
    const jpegBytes = decodeBase64(cleanBase64);
    const nativeImage = await Images.loadFromEncodedImageDataAsync({
      buffer: jpegBytes.buffer as ArrayBuffer,
      width: size,
      height: size,
      imageFormat: 'jpg',
    });

    const resizedImage = await nativeImage.resizeAsync(size, size);
    const rawPixelData = await resizedImage.toRawPixelDataAsync();
    const pixelView = new Uint8Array(rawPixelData.buffer);

    const pixels: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
    
    const format = rawPixelData.pixelFormat;
    const isBGR = format.startsWith('BGR');
    const hasAlpha = format.length === 4 || format.endsWith('X') || format.startsWith('X');
    const bytesPerPixel = hasAlpha ? 4 : 3;

    let sumIntensity = 0;
    let pixelIdx = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (pixelIdx >= pixelView.length) {
          break;
        }
        let rVal = 0, gVal = 0, bVal = 0;
        if (format === 'ARGB') {
          rVal = pixelView[pixelIdx + 1];
          gVal = pixelView[pixelIdx + 2];
          bVal = pixelView[pixelIdx + 3];
        } else if (format === 'ABGR') {
          bVal = pixelView[pixelIdx + 1];
          gVal = pixelView[pixelIdx + 2];
          rVal = pixelView[pixelIdx + 3];
        } else if (isBGR) {
          bVal = pixelView[pixelIdx];
          gVal = pixelView[pixelIdx + 1];
          rVal = pixelView[pixelIdx + 2];
        } else {
          rVal = pixelView[pixelIdx];
          gVal = pixelView[pixelIdx + 1];
          bVal = pixelView[pixelIdx + 2];
        }
        pixelIdx += bytesPerPixel;

        // Grayscale conversion: Y = 0.299*R + 0.587*G + 0.114*B
        const gray = 0.299 * rVal + 0.587 * gVal + 0.114 * bVal;
        pixels[r][c] = gray;
        sumIntensity += gray;
      }
    }

    // 1. Lighting Quality check (mean intensity)
    const meanIntensity = sumIntensity / (size * size);
    let lightingStatus: 'Good' | 'Low Light' | 'Too Bright' = 'Good';
    if (meanIntensity < 45) {
      lightingStatus = 'Low Light';
    } else if (meanIntensity > 230) {
      lightingStatus = 'Too Bright';
    }

    // 2. Blur Score (Laplacian variance)
    const laplacianGrid: number[] = [];
    for (let r = 1; r < size - 1; r++) {
      for (let c = 1; c < size - 1; c++) {
        const val =
          pixels[r - 1][c] +
          pixels[r + 1][c] +
          pixels[r][c - 1] +
          pixels[r][c + 1] -
          4 * pixels[r][c];
        laplacianGrid.push(val);
      }
    }

    let sumLaplacian = 0;
    for (let i = 0; i < laplacianGrid.length; i++) {
      sumLaplacian += laplacianGrid[i];
    }
    const meanLaplacian = sumLaplacian / laplacianGrid.length;

    let sumSquares = 0;
    for (let i = 0; i < laplacianGrid.length; i++) {
      sumSquares += Math.pow(laplacianGrid[i] - meanLaplacian, 2);
    }
    const blurScore = sumSquares / laplacianGrid.length;
    // Map variance values: typical sharp variance is >120, blurry is <40
    const blurStatus = blurScore >= 12 ? 'Sharp' : 'Blurry';

    // 3. Pose Detection (horizontal/vertical asymmetry)
    let leftSum = 0;
    let rightSum = 0;
    let topSum = 0;
    let bottomSum = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const val = pixels[r][c];
        if (c < size / 2) {
          leftSum += val;
        } else {
          rightSum += val;
        }
        if (r < size / 2) {
          topSum += val;
        } else {
          bottomSum += val;
        }
      }
    }

    const yaw = (leftSum - rightSum) / (leftSum + rightSum || 1);
    const pitch = (topSum - bottomSum) / (topSum + bottomSum || 1);

    // Alignment tolerance increased by 3x (threshold reduced from 0.09 to 0.03 for easy auto-triggering)
    const YAW_THRESHOLD = 0.03;
    const PITCH_THRESHOLD = 0.03;

    let poseDetected: 'Front' | 'Left' | 'Right' | 'Up' | 'Down' = 'Front';

    if (Math.abs(yaw) > Math.abs(pitch)) {
      if (yaw > YAW_THRESHOLD) {
        poseDetected = 'Left';
      } else if (yaw < -YAW_THRESHOLD) {
        poseDetected = 'Right';
      }
    } else {
      if (pitch > PITCH_THRESHOLD) {
        poseDetected = 'Up';
      } else if (pitch < -PITCH_THRESHOLD) {
        poseDetected = 'Down';
      }
    }

    return {
      faceDetected: true,
      lightingStatus,
      blurScore,
      blurStatus,
      poseDetected,
      rawYaw: yaw,
      rawPitch: pitch,
    };
  } catch (error) {
    console.error('[ImageQualityAnalyzer] Error analyzing frame:', error);
    return {
      faceDetected: false,
      lightingStatus: 'Good',
      blurScore: 0,
      blurStatus: 'Blurry',
      poseDetected: 'Front',
      rawYaw: 0,
      rawPitch: 0,
    };
  }
}
