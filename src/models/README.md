# MobileFaceNet INT8 Quantized Model Specifications

This directory contains the MobileFaceNet TensorFlow Lite model used for offline face embedding generation.

## Model Summary

- **Model Name**: MobileFaceNet INT8 Quantized
- **Input Shape**: `112x112x3` (112 width, 112 height, 3 color channels - RGB)
- **Output Shape**: `128` (128-dimensional floating-point feature embedding vector)
- **File Size**: ~5.2 MB (5,233,552 bytes)
- **Source URL**: [FaceRecognitionAuth TFLite Asset](https://github.com/MCarlomagno/FaceRecognitionAuth/raw/master/assets/mobilefacenet.tflite)
- **Quantization Method**: INT8 Quantization (Post-Training Quantization with full integer calibration for optimal mobile inference latency and reduced memory footprint).
