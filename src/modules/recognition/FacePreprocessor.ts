import { Images } from 'react-native-nitro-image';

/**
 * Phase 2 - Face Preprocessing & Image Enhancement & Landmark Alignment
 * Natively decodes, enhances, rotates, crops, and normalizes pixels.
 */
export class FacePreprocessor {
  /**
   * Performs eye alignment and tight cropping around the face in-memory.
   * 1. Computes the eye roll angle.
   * 2. Crops a larger padding region to prevent rotation clipping.
   * 3. Rotates the crop to level the eyes.
   * 4. Crops the final centered face.
   * 5. Resizes to 112x112.
   */
  public static async alignAndCropFace(
    nativeImage: any, // JSI image instance
    boundingBox: { x: number; y: number; width: number; height: number },
    landmarks: { x: number; y: number }[]
  ): Promise<any> {
    const imgWidth = nativeImage.width;
    const imgHeight = nativeImage.height;

    // 1. Calculate eye angle (landmark 0: right eye, landmark 1: left eye)
    const rightEye = landmarks[0];
    const leftEye = landmarks[1];
    const dy = leftEye.y - rightEye.y;
    const dx = leftEye.x - rightEye.x;
    const angleRad = Math.atan2(dy, dx);
    const angleDeg = angleRad * (180.0 / Math.PI);

    // 2. Center coordinates of face in pixels
    const faceCenterX = (boundingBox.x + boundingBox.width / 2) * imgWidth;
    const faceCenterY = (boundingBox.y + boundingBox.height / 2) * imgHeight;
    const faceSize = Math.max(boundingBox.width * imgWidth, boundingBox.height * imgHeight);

    // Crop a larger padded region (1.6x) to allow rotation without cropping boundary artifacts
    const padFactor = 1.6;
    const cropSize = Math.min(
      Math.round(faceSize * padFactor),
      Math.min(imgWidth, imgHeight)
    );

    let startX = Math.round(faceCenterX - cropSize / 2);
    let startY = Math.round(faceCenterY - cropSize / 2);

    // Bounds safety clamping
    if (startX < 0) startX = 0;
    if (startY < 0) startY = 0;
    if (startX + cropSize > imgWidth) startX = imgWidth - cropSize;
    if (startY + cropSize > imgHeight) startY = imgHeight - cropSize;

    // 3. Extract the larger face region
    const largeCrop = await nativeImage.cropAsync(startX, startY, cropSize, cropSize);

    // 4. Rotate by negative of eye roll angle to make eyes level
    const rotated = await largeCrop.rotateAsync(-angleDeg);

    // 5. Crop tight center face region from the rotated square
    const finalSize = Math.round(faceSize);
    const tightX = Math.max(0, Math.round(rotated.width / 2 - finalSize / 2));
    const tightY = Math.max(0, Math.round(rotated.height / 2 - finalSize / 2));
    const tightSize = Math.min(finalSize, Math.min(rotated.width - tightX, rotated.height - tightY));

    const finalCrop = await rotated.cropAsync(tightX, tightY, tightSize, tightSize);

    // 6. Resize to standard MobileFaceNet 112x112 dimension
    return await finalCrop.resizeAsync(112, 112);
  }

  public static async preprocess(base64Jpeg: string): Promise<Float32Array> {
    const cleanBase64 = base64Jpeg.replace(/^data:image\/[a-z]+;base64,/, '').split('#')[0];
    const binaryBytes = this.decodeBase64(cleanBase64);

    // 1. Native Image Decoding (Fast JSI bridge execution)
    const nativeImage = await Images.loadFromEncodedImageDataAsync({
      buffer: binaryBytes.buffer as ArrayBuffer,
      width: 112,
      height: 112,
      imageFormat: 'jpg',
    });

    const resizedImage = await nativeImage.resizeAsync(112, 112);
    const rawPixelData = await resizedImage.toRawPixelDataAsync();
    const pixelView = new Uint8Array(rawPixelData.buffer);

    const format = rawPixelData.pixelFormat;
    const isBGR = format.startsWith('BGR');
    const hasAlpha = format.length === 4 || format.endsWith('X') || format.startsWith('X');
    const bytesPerPixel = hasAlpha ? 4 : 3;

    // 2. Detect Low Light Condition & Calculate Mean Intensity
    let sumIntensity = 0;
    let pixelCount = 0;
    for (let i = 0; i < pixelView.length; i += bytesPerPixel) {
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
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      sumIntensity += gray;
      pixelCount++;
    }
    const meanIntensity = sumIntensity / (pixelCount || 1);

    // 3. Apply Gamma Correction if lighting is low (< 75)
    let processedView = pixelView;
    if (meanIntensity < 75) {
      console.log(`[FacePreprocessor] Low-light environment detected (mean gray: ${meanIntensity.toFixed(1)}). Applying Gamma Correction...`);
      const gamma = Math.max(0.4, 0.4 + (meanIntensity - 30) / 100);
      
      // Build 0-255 lookup table to avoid Math.pow in tight loops
      const lut = new Uint8Array(256);
      for (let v = 0; v < 256; v++) {
        lut[v] = Math.round(Math.pow(v / 255.0, gamma) * 255.0);
      }

      processedView = new Uint8Array(pixelView.length);
      for (let i = 0; i < pixelView.length; i += bytesPerPixel) {
        processedView[i] = lut[pixelView[i]];
        processedView[i + 1] = lut[pixelView[i + 1]];
        processedView[i + 2] = lut[pixelView[i + 2]];
        if (bytesPerPixel === 4) {
          processedView[i + 3] = pixelView[i + 3];
        }
      }
    }

    const targetPixelCount = 112 * 112 * 3;
    const normalizedFloats = new Float32Array(targetPixelCount);

    // 4. RGB channel mapping & Normalization [ (x - 127.5) / 127.5 ]
    let targetIdx = 0;
    for (let i = 0; i < processedView.length; i += bytesPerPixel) {
      if (targetIdx >= targetPixelCount) break;

      let r = 0, g = 0, b = 0;
      if (format === 'ARGB') {
        r = processedView[i + 1];
        g = processedView[i + 2];
        b = processedView[i + 3];
      } else if (format === 'ABGR') {
        b = processedView[i + 1];
        g = processedView[i + 2];
        r = processedView[i + 3];
      } else if (isBGR) {
        b = processedView[i];
        g = processedView[i + 1];
        r = processedView[i + 2];
      } else {
        r = processedView[i];
        g = processedView[i + 1];
        b = processedView[i + 2];
      }

      normalizedFloats[targetIdx++] = (r - 127.5) / 127.5;
      normalizedFloats[targetIdx++] = (g - 127.5) / 127.5;
      normalizedFloats[targetIdx++] = (b - 127.5) / 127.5;
    }

    return normalizedFloats;
  }

  private static decodeBase64(base64Str: string): Uint8Array {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < alphabet.length; i++) {
      lookup[alphabet.charCodeAt(i)] = i;
    }
    let padding = 0;
    if (base64Str.endsWith('==')) padding = 2;
    else if (base64Str.endsWith('=')) padding = 1;

    const outputLength = (base64Str.length * 3) / 4 - padding;
    const bytes = new Uint8Array(outputLength);
    let byteIndex = 0;
    for (let i = 0; i < base64Str.length; i += 4) {
      const code0 = lookup[base64Str.charCodeAt(i)];
      const code1 = lookup[base64Str.charCodeAt(i + 1)];
      const code2 = lookup[base64Str.charCodeAt(i + 2)];
      const code3 = lookup[base64Str.charCodeAt(i + 3)];

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
}
