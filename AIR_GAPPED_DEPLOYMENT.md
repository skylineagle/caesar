# Frigate Air-gapped Deployment Guide

This guide provides a complete solution for deploying Frigate in air-gapped environments where internet connectivity is not available. The solution pre-fetches all necessary model files during the Docker image build process, ensuring that features like semantic search, face recognition, and license plate recognition work without requiring internet access at runtime.

## 🎯 Features Supported

The air-gapped image includes pre-fetched models for:

### ✅ Semantic Search
- **Jina CLIP v1**: Text and vision models (both fp16 and quantized versions)
- **Jina CLIP v2**: Multilingual support models (both fp16 and quantized versions)
- **Tokenizers**: Pre-downloaded tokenizer files for both v1 and v2

### ✅ Face Recognition
- **Face Detection**: YN face detector model
- **Face Recognition**: Both FaceNet (small) and ArcFace (large) embedding models  
- **Face Landmarks**: Landmark detection for face alignment

### ✅ License Plate Recognition (LPR)
- **PaddleOCR**: Text detection, classification, and recognition models
- **YOLOv9**: License plate detection model for users without Frigate+

### ✅ Bird Classification
- **MobileNet v2**: Bird species classification model
- **Label Maps**: Comprehensive bird species labels

## 📋 Prerequisites

- Docker or Docker Desktop installed
- At least 20GB of free disk space (for build process)
- Internet connection (for building the image)
- Access to the Frigate source code repository

## 🔧 Quick Start

### 1. Clone the Frigate Repository

```bash
git clone https://github.com/blakeblackshear/frigate.git
cd frigate
```

### 2. Run the Build Script

Make the build script executable and run it:

```bash
chmod +x build_airgapped.sh
./build_airgapped.sh
```

The script will:
- Download all necessary model files (~2-3GB)
- Build a complete Frigate Docker image
- Verify that models are properly included
- Provide deployment instructions

### 3. Export the Image

Save the built image to a file for transfer:

```bash
docker save frigate:airgapped | gzip > frigate-airgapped.tar.gz
```

### 4. Transfer to Air-gapped Environment

Copy the `frigate-airgapped.tar.gz` file to your target system using your preferred method (USB drive, secure file transfer, etc.).

### 5. Load and Deploy

On the air-gapped system:

```bash
# Load the image
docker load < frigate-airgapped.tar.gz

# Run Frigate
docker run -d \
  --name frigate \
  --restart=unless-stopped \
  --mount type=tmpfs,target=/tmp/cache,tmpfs-size=1000000000 \
  --device /dev/bus/usb:/dev/bus/usb \
  --device /dev/dri/renderD128 \
  --shm-size=64m \
  -v /path/to/your/config:/config \
  -v /path/to/your/storage:/media/frigate \
  -v /etc/localtime:/etc/localtime:ro \
  -p 5000:5000 \
  -p 8554:8554 \
  -p 8555:8555/tcp \
  -p 8555:8555/udp \
  frigate:airgapped
```

## ⚙️ Configuration

### Enable Features in config.yml

To use the pre-fetched models, enable the desired features in your Frigate configuration:

```yaml
# Semantic Search
semantic_search:
  enabled: true
  model: "jinav1"  # or "jinav2" 
  model_size: "small"  # or "large"

# Face Recognition
face_recognition:
  enabled: true
  model_size: "small"  # or "large"

# License Plate Recognition
lpr:
  enabled: true
  model_size: "small"  # or "large"

# Bird Classification (optional)
objects:
  track:
    - person
    - bird  # Enable if you want bird classification
```

### Model Selection

#### Semantic Search Models
- **Jina v1**: Recommended for English-only deployments, lower resource usage
- **Jina v2**: Supports 89 languages, higher resource requirements
- **Small**: Quantized models, CPU-optimized, lower memory usage
- **Large**: Full precision models, GPU-accelerated when available

#### Face Recognition Models
- **Small**: FaceNet-based, CPU-optimized, good for basic recognition
- **Large**: ArcFace-based, more accurate, requires GPU for optimal performance

#### LPR Models
- **Small**: Lighter PaddleOCR detection model
- **Large**: Higher accuracy PaddleOCR detection model

## 📁 Model Files Included

The air-gapped image includes the following models:

### Semantic Search (`/config/model_cache/jinaai/`)
```
jina-clip-v1/
├── onnx/
│   ├── text_model_fp16.onnx
│   ├── vision_model_fp16.onnx
│   └── vision_model_quantized.onnx
├── preprocessor_config.json
└── tokenizer/

jina-clip-v2/
├── onnx/
│   ├── model_fp16.onnx
│   └── model_quantized.onnx
├── preprocessor_config.json
└── tokenizer/
```

### Face Recognition (`/config/model_cache/facedet/`)
```
facedet/
├── facedet.onnx
├── landmarkdet.yaml
├── facenet.tflite
└── arcface.onnx
```

### License Plate Recognition (`/config/model_cache/`)
```
paddleocr-onnx/
├── detection-small.onnx
├── detection-large.onnx
├── classification.onnx
└── recognition.onnx

yolov9_license_plate/
└── yolov9-256-license-plates.onnx
```

### Bird Classification (`/config/model_cache/bird/`)
```
bird/
├── bird.tflite
└── birdmap.txt
```

## 🔍 Manual Model Download

If you prefer to download models manually or need to update specific models, you can use the standalone script:

```bash
# Download to custom directory
export MODEL_CACHE_DIR="/path/to/your/model/cache"
python3 docker/main/prefetch_models.py
```

## 🛠️ Troubleshooting

### Model Loading Issues

If models fail to load:

1. **Check model files exist**:
   ```bash
   docker exec frigate find /config/model_cache -name "*.onnx" -o -name "*.tflite"
   ```

2. **Verify configuration**:
   - Ensure features are enabled in `config.yml`
   - Check that model sizes match your configuration

3. **Check logs**:
   ```bash
   docker logs frigate | grep -i "model\|download\|embedding"
   ```

### Performance Issues

- **High memory usage**: Use "small" model sizes
- **Slow performance**: Enable GPU acceleration when available
- **CPU overload**: Reduce concurrent processing or use quantized models

### Network Connectivity Test

To verify your deployment is truly air-gapped:

```bash
# Run with no network access
docker run --rm --network none frigate:airgapped python3 -c "
import urllib.request
try:
    urllib.request.urlopen('https://google.com', timeout=5)
    print('ERROR: Network access detected!')
except:
    print('SUCCESS: No network access confirmed')
"
```

## 📊 Resource Requirements

### Minimum Requirements
- **RAM**: 8GB (with small models)
- **Storage**: 10GB free space
- **CPU**: 4 cores recommended

### Recommended Requirements
- **RAM**: 16GB+ (with large models)
- **Storage**: 20GB+ free space
- **GPU**: Dedicated GPU for large models
- **CPU**: 8+ cores for optimal performance

## 🔄 Updating Models

To update models in your air-gapped deployment:

1. Rebuild the image with the latest Frigate code
2. Re-run the build script to fetch updated models
3. Export and transfer the new image
4. Replace the running container

## 📝 Model Sources

The models are downloaded from these trusted sources:

- **Jina Models**: [Hugging Face - Jina AI](https://huggingface.co/jinaai)
- **Face Models**: [GitHub - NickM-27/facenet-onnx](https://github.com/NickM-27/facenet-onnx)
- **LPR Models**: [GitHub - hawkeye217/paddleocr-onnx](https://github.com/hawkeye217/paddleocr-onnx)
- **Bird Models**: [Google Coral Test Data](https://github.com/google-coral/test_data)

## 🛡️ Security Considerations

- Model files are downloaded over HTTPS with verification
- No modifications are made to the original model files
- All models are from official, trusted repositories
- The build process can be audited for security compliance

## 🆘 Support

If you encounter issues:

1. Check the [Frigate Documentation](https://docs.frigate.video/)
2. Review the troubleshooting section above
3. Examine Docker and Frigate logs
4. Ensure your air-gapped system meets the resource requirements

## 📄 License

This solution follows the same license as the main Frigate project. Model files retain their original licenses as specified by their respective authors.