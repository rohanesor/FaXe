export interface FaceDetectionResult {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  landmarks?: Array<{ x: number; y: number }>; // Exactly 6 landmark points
  isAligned: boolean;
  fillRatio: number;
}

export interface AlignedFaceFrame {
  timestamp: number;
  width: number;
  height: number;
  base64jpeg: string; // cropped face image formatted as base64-encoded string
}
