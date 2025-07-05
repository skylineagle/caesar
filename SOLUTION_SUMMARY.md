# Frigate Air-gapped Deployment Solution

## 🎯 Overview

This solution enables Frigate deployment in air-gapped environments by pre-fetching all required model files during the Docker image build process. No internet connectivity is required at runtime for semantic search, face recognition, and license plate recognition features.

## 📦 Solution Components

### 1. Model Prefetch Script (`docker/main/prefetch_models.py`)
- Downloads all necessary models from HuggingFace, GitHub, and other sources
- Creates proper directory structure expected by Frigate
- Handles both small (CPU-optimized) and large (GPU-accelerated) model variants
- Supports semantic search (Jina v1/v2), face recognition, LPR, and bird classification

### 2. Air-gapped Dockerfile (`docker/main/Dockerfile.airgapped`)
- Extends the main Frigate Dockerfile
- Adds a model prefetch stage that runs during build
- Embeds all model files into the final Docker image
- Maintains full compatibility with standard Frigate features

### 3. Build Script (`build_airgapped.sh`)
- Automated build process with progress indicators
- Verification of downloaded models
- Comprehensive usage instructions
- Error handling and validation

### 4. Configuration Examples (`config/airgapped-example.yml`)
- Complete example showing how to enable all air-gapped features
- Commented configuration options
- Best practices for resource optimization

### 5. CI/CD Pipeline (`.github/workflows/airgapped.yml`)
- Automated multi-platform builds (AMD64/ARM64)
- Publishes to `skylineag/caesar` registry on Docker Hub
- Comprehensive testing and validation
- Weekly scheduled builds to keep models fresh

### 6. CI Setup Guide (`CI_SETUP.md`)
- Instructions for configuring repository secrets
- Docker Hub authentication setup
- Workflow monitoring and troubleshooting

### 7. Documentation (`AIR_GAPPED_DEPLOYMENT.md`)
- Complete deployment guide
- Troubleshooting instructions
- Resource requirements and recommendations

## 🚀 Quick Start

### Option 1: Use Pre-built Images (Recommended)

```bash
# Pull the latest air-gapped image (requires internet)
docker pull skylineag/caesar:airgapped

# Save for transfer to air-gapped environment
docker save skylineag/caesar:airgapped | gzip > frigate-airgapped.tar.gz

# Transfer and load on air-gapped system
docker load < frigate-airgapped.tar.gz
```

### Option 2: Build Yourself

```bash
# 1. Clone repository
git clone https://github.com/blakeblackshear/frigate.git
cd frigate

# 2. Build air-gapped image (requires internet connection)
chmod +x build_airgapped.sh
./build_airgapped.sh

# 3. Export for transfer
docker save frigate:airgapped | gzip > frigate-airgapped.tar.gz

# 4. Transfer to air-gapped environment and load
docker load < frigate-airgapped.tar.gz
```

### Deploy with proper configuration

```bash
# 5. Deploy with proper configuration
docker run -d \
  --name frigate \
  --restart=unless-stopped \
  --mount type=tmpfs,target=/tmp/cache,tmpfs-size=1000000000 \
  --device /dev/bus/usb:/dev/bus/usb \
  --device /dev/dri/renderD128 \
  --shm-size=64m \
  -v /path/to/config:/config \
  -v /path/to/storage:/media/frigate \
  -v /etc/localtime:/etc/localtime:ro \
  -p 5000:5000 \
  -p 8554:8554 \
  -p 8555:8555 \
  skylineag/caesar:airgapped
```

## 📋 Pre-fetched Models

The solution includes models for:

| Feature | Models Included | Size | Optimization |
|---------|----------------|------|--------------|
| **Semantic Search** | Jina CLIP v1/v2 (text + vision) | ~1.5GB | CPU & GPU variants |
| **Face Recognition** | FaceNet + ArcFace + detection | ~200MB | Small & large models |
| **License Plate Recognition** | PaddleOCR + YOLOv9 | ~300MB | Detection + recognition |
| **Bird Classification** | MobileNet v2 + labels | ~10MB | CPU optimized |

**Total**: ~2-3GB of model files embedded in the image

## ⚙️ Feature Configuration

Enable features in your `config.yml`:

```yaml
semantic_search:
  enabled: true
  model: "jinav1"      # or jinav2 for multilingual
  model_size: "small"  # or large for GPU acceleration

face_recognition:
  enabled: true
  model_size: "small"  # or large for better accuracy

lpr:
  enabled: true
  model_size: "small"  # or large for better detection
```

## 🔍 Verification

Test your air-gapped deployment:

```bash
# Verify models are embedded
docker run --rm skylineag/caesar:airgapped find /config/model_cache -name "*.onnx" -o -name "*.tflite"

# Test no network access (should fail gracefully)
docker run --rm --network none skylineag/caesar:airgapped python3 -c "
import urllib.request
try:
    urllib.request.urlopen('https://google.com', timeout=5)
    print('ERROR: Network access detected!')
except:
    print('SUCCESS: No network access confirmed')
"
```

## 💡 Key Benefits

- ✅ **True Air-gapped**: No internet required at runtime
- ✅ **Complete Features**: All major Frigate enrichment features supported
- ✅ **Easy Deployment**: Single Docker image with everything included
- ✅ **Flexible Configuration**: Choose CPU or GPU optimized models
- ✅ **Production Ready**: Based on official Frigate Dockerfile
- ✅ **Security Compliant**: All models from trusted official sources

## 🛠️ Maintenance

To update models:
1. Re-run build script with latest Frigate code
2. Export updated image
3. Deploy to air-gapped environment

## 📊 Resource Requirements

- **Minimum**: 8GB RAM, 10GB storage, 4 CPU cores
- **Recommended**: 16GB+ RAM, 20GB+ storage, GPU for large models
- **Build Environment**: 20GB free space, internet connection

## 🆘 Support

- See `AIR_GAPPED_DEPLOYMENT.md` for complete documentation
- Check Frigate logs for model loading issues
- Verify configuration matches available model variants
- Ensure adequate system resources for chosen model sizes

This solution provides a complete, production-ready way to deploy Frigate in air-gapped environments while maintaining full access to advanced AI features. 🎉