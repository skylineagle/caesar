# Frigate Model Fetching Approach

## Overview

This document describes the new model fetching approach for Frigate air-gapped deployments, which replaces the complex Docker-based air-gapped build process with a simpler, more efficient solution.

## Problem with Previous Approach

The previous air-gapped approach had several issues:

1. **Complexity**: Required building entire Docker images with pre-fetched models
2. **Size**: Docker images were very large (10GB+) due to including the entire runtime
3. **Maintenance**: Difficult to update models without rebuilding entire images
4. **Flexibility**: Limited to specific Docker image versions
5. **Resource Usage**: High disk space and build time requirements

## New Solution

### Script-Based Model Fetching

The new approach uses a bash script (`scripts/fetch_models.sh`) that:

1. **Downloads Models**: Fetches all required model files from official sources
2. **Creates Package**: Packages models into a zip file for easy transfer
3. **Simple Deployment**: Mount the extracted models as a volume in any Frigate container

### Key Components

#### 1. Fetch Script (`scripts/fetch_models.sh`)

- Downloads all required models for:
  - Semantic Search (Jina CLIP v1 & v2)
  - Face Recognition (FaceNet & ArcFace)
  - License Plate Recognition (PaddleOCR & YOLOv9)
  - Bird Classification (MobileNet v2)
- Creates proper directory structure
- Packages everything into a zip file
- Includes progress indicators and error handling

#### 2. GitHub Action (`.github/workflows/create-models-zip.yml`)

- Automatically creates model packages on:
  - Manual trigger
  - Script updates
  - Tagged releases
- Uploads packages as artifacts and releases
- Provides easy distribution mechanism

#### 3. Documentation (`scripts/README.md`)

- Complete usage instructions
- Troubleshooting guide
- Configuration examples
- Best practices

## Usage Comparison

### Old Approach (Docker-based)

```bash
# Build air-gapped image (30+ minutes, 10GB+)
./build_airgapped.sh

# Export image
docker save frigate:airgapped | gzip > frigate-airgapped.tar.gz

# Transfer and load (10GB+ file)
docker load < frigate-airgapped.tar.gz

# Run with air-gapped image
docker run -d --name frigate frigate:airgapped
```

### New Approach (Script-based)

```bash
# Download models (5-10 minutes, 2-3GB)
./scripts/fetch_models.sh

# Transfer zip file (2-3GB)
# Extract on target system
unzip frigate-models-*.zip

# Run with standard image + models
docker run -d \
  --name frigate \
  -v ./model_cache:/config/model_cache \
  ghcr.io/blakeblackshear/frigate:latest
```

## Advantages

### 1. Size Reduction
- **Old**: 10GB+ Docker images
- **New**: 2-3GB model packages
- **Improvement**: 70%+ size reduction

### 2. Build Time
- **Old**: 30+ minutes for full Docker build
- **New**: 5-10 minutes for model download
- **Improvement**: 70%+ time reduction

### 3. Flexibility
- **Old**: Tied to specific Docker image version
- **New**: Works with any Frigate container version
- **Improvement**: Maximum compatibility

### 4. Maintenance
- **Old**: Rebuild entire image for model updates
- **New**: Update models independently
- **Improvement**: Easier maintenance

### 5. Resource Usage
- **Old**: High disk space and memory requirements
- **New**: Minimal resource usage
- **Improvement**: Better resource efficiency

## Implementation Details

### Model Sources

All models are downloaded from official, trusted sources:

- **Jina Models**: HuggingFace (jinaai/jina-clip-v1, jinaai/jina-clip-v2)
- **Face Models**: GitHub (NickM-27/facenet-onnx)
- **LPR Models**: GitHub (hawkeye217/paddleocr-onnx, hawkeye217/yolov9-license-plates)
- **Bird Models**: Google Coral Test Data

### Directory Structure

The script creates the exact directory structure that Frigate expects:

```
model_cache/
├── jinaai/jina-clip-v1/     # Semantic search v1
├── jinaai/jina-clip-v2/     # Semantic search v2
├── facedet/                 # Face recognition
├── paddleocr-onnx/          # LPR detection
├── yolov9_license_plate/    # LPR detection
├── bird/                    # Bird classification
├── tensorrt/                # TensorRT cache
├── openvino/                # OpenVINO cache
├── rknn_cache/              # RKNN cache
├── labelmap.txt             # Object labels
└── audio-labelmap.txt       # Audio labels
```

### Error Handling

The script includes comprehensive error handling:

- Network connectivity checks
- Disk space verification
- Download retry logic
- Progress indicators
- Detailed error messages

## Migration Guide

### For Existing Air-gapped Users

1. **Stop using air-gapped images**:
   ```bash
   docker stop frigate
   docker rm frigate
   ```

2. **Download new model package**:
   ```bash
   ./scripts/fetch_models.sh
   ```

3. **Extract and deploy**:
   ```bash
   unzip frigate-models-*.zip
   docker run -d \
     --name frigate \
     -v ./model_cache:/config/model_cache \
     -v /path/to/config:/config \
     -v /path/to/storage:/media/frigate \
     -p 5000:5000 \
     ghcr.io/blakeblackshear/frigate:latest
   ```

### Configuration Updates

No configuration changes required - the same `config.yml` settings work with the new approach.

## Future Enhancements

### Planned Improvements

1. **Incremental Updates**: Only download changed models
2. **Model Validation**: Verify downloaded model integrity
3. **Compression Options**: Multiple compression formats
4. **Custom Model Support**: Allow adding custom models
5. **Automated Testing**: Validate models work with Frigate

### Integration Opportunities

1. **CI/CD Integration**: Automatic model updates in pipelines
2. **Release Automation**: Model packages with Frigate releases
3. **Community Models**: Support for community-contributed models
4. **Model Registry**: Centralized model management

## Conclusion

The new script-based model fetching approach provides a significant improvement over the previous Docker-based air-gapped solution. It offers:

- **Better Performance**: Faster downloads and smaller packages
- **Improved Flexibility**: Works with any Frigate version
- **Easier Maintenance**: Simple model updates
- **Better Resource Usage**: Lower disk and memory requirements
- **Enhanced User Experience**: Simpler deployment process

This approach makes air-gapped Frigate deployments more accessible and maintainable while providing all the same functionality as the previous solution.