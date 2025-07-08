# Frigate Scripts

This directory contains utility scripts for Frigate, including the new model fetching approach for air-gapped deployments.

## Model Fetching Script

### Overview

The `fetch_models.sh` script provides a simpler alternative to the Docker-based air-gapped approach. Instead of building a complete Docker image with pre-fetched models, this script downloads all required model files and packages them into a zip file for easy transfer to air-gapped environments.

### Features

- **Semantic Search Models**: Jina CLIP v1 & v2 (text and vision models)
- **Face Recognition Models**: FaceNet & ArcFace models
- **License Plate Recognition Models**: PaddleOCR & YOLOv9 models
- **Bird Classification Models**: MobileNet v2 model
- **Additional Files**: Label maps and configuration files

### Usage

#### Local Usage

1. **Run the script**:

   ```bash
   ./scripts/fetch_models.sh
   ```

2. **Custom options**:

   ```bash
   # Specify output directory
   ./scripts/fetch_models.sh --output /path/to/custom/directory

   # Specify zip filename
   ./scripts/fetch_models.sh --zip my-custom-models.zip

   # Show help
   ./scripts/fetch_models.sh --help
   ```

3. **Transfer and use**:

   ```bash
   # Transfer the zip file to your air-gapped system
   # Extract the models
   unzip frigate-models-*.zip

   # Run Frigate with the models
   docker run -d \
     --name frigate \
     --restart=unless-stopped \
     -v ./model_cache:/config/model_cache \
     -v /path/to/your/config:/config \
     -v /path/to/your/storage:/media/frigate \
     -p 5000:5000 \
     ghcr.io/blakeblackshear/frigate:latest
   ```

#### GitHub Actions

The repository includes a GitHub Action workflow (`.github/workflows/create-models-zip.yml`) that automatically creates model packages:

1. **Manual trigger**: Go to Actions → "Create Models Zip" → Run workflow
2. **Automatic trigger**: Push changes to the script files or create a tag with `-models` suffix
3. **Download**: Get the zip file from the workflow artifacts or releases

### Prerequisites

The script requires the following utilities:

- `curl` or `wget` (for downloading files)
- `zip` (for creating the package)
- `unzip` (for extracting the package)
- At least 5GB of free disk space

### Output Structure

The script creates the following directory structure:

```
model_cache/
├── jinaai/
│   ├── jina-clip-v1/
│   │   ├── onnx/
│   │   ├── preprocessor_config.json
│   │   └── tokenizer/
│   └── jina-clip-v2/
│       ├── onnx/
│       ├── preprocessor_config.json
│       └── tokenizer/
├── facedet/
│   ├── facedet.onnx
│   ├── landmarkdet.yaml
│   ├── facenet.tflite
│   └── arcface.onnx
├── paddleocr-onnx/
│   ├── detection-small.onnx
│   ├── detection-large.onnx
│   ├── classification.onnx
│   └── recognition.onnx
├── yolov9_license_plate/
│   └── yolov9-256-license-plates.onnx
├── bird/
│   ├── bird.tflite
│   └── birdmap.txt
├── tensorrt/
├── openvino/
├── rknn_cache/
├── labelmap.txt
└── audio-labelmap.txt
```

### Configuration

To use the downloaded models, enable the desired features in your Frigate `config.yml`:

```yaml
# Semantic Search
semantic_search:
  enabled: true
  model: "jinav1" # or "jinav2"
  model_size: "small" # or "large"

# Face Recognition
face_recognition:
  enabled: true
  model_size: "small" # or "large"

# License Plate Recognition
lpr:
  enabled: true
  model_size: "small" # or "large"

# Bird Classification (optional)
objects:
  track:
    - person
    - bird # Enable if you want bird classification
```

### Detector Configuration

For detailed information on configuring different detector types (CPU, OpenVINO, TensorRT, ONNX, Edge TPU, RKNN, Hailo), see [DETECTOR_CONFIGURATION.md](DETECTOR_CONFIGURATION.md).

**Quick Examples**:

```yaml
# OpenVINO (Intel/AMD)
detectors:
  ov:
    type: openvino
    device: GPU

# TensorRT (NVIDIA)
detectors:
  tensorrt:
    type: tensorrt
    device: 0

# ONNX (Multi-platform)
detectors:
  onnx:
    type: onnx
    device: GPU
```

### Advantages Over Docker Approach

1. **Smaller Size**: Only model files, not entire Docker image
2. **Faster Transfer**: Zip files are typically smaller than Docker images
3. **Easier Updates**: Can update models without rebuilding entire image
4. **Flexible Deployment**: Can use with any Frigate container version
5. **Better Caching**: Models can be shared across multiple containers

### Troubleshooting

#### Download Failures

If downloads fail:

1. Check internet connectivity
2. Verify the model URLs are still accessible
3. Check available disk space
4. Try running the script again

#### Model Loading Issues

If models don't load in Frigate:

1. Verify the `model_cache` directory is mounted correctly
2. Check file permissions on the model files
3. Ensure the directory structure matches expectations
4. Check Frigate logs for specific error messages

#### Performance Issues

- Use "small" model sizes for lower resource usage
- Ensure adequate RAM (8GB+ recommended)
- Consider GPU acceleration for large models

### File Sizes

Typical package sizes:

- **Small models only**: ~500MB
- **All models**: ~2-3GB
- **Complete package**: ~2.5-3.5GB

### Security

- All models are downloaded from official, trusted sources
- Downloads use HTTPS with verification
- No modifications are made to the original model files
- The script can be audited for security compliance

### Support

For issues with the model fetching script:

1. Check the troubleshooting section above
2. Review the script output for specific error messages
3. Ensure your system meets the prerequisites
4. Check the Frigate documentation for model-specific issues
