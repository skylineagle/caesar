#!/bin/bash

# Build script for Frigate air-gapped Docker image with pre-fetched models
# This script builds a Frigate image that includes all model files required
# for semantic search, face recognition, LPR, and other features.

set -e

# Configuration
IMAGE_NAME="caesar:airgapped"
DOCKERFILE="docker/main/Dockerfile.airgapped"
BUILD_CONTEXT="."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed and running
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Check if we're in the right directory
check_directory() {
    if [[ ! -f "frigate/const.py" ]]; then
        print_error "This script must be run from the root of the Caesar repository."
        exit 1
    fi

    if [[ ! -f "$DOCKERFILE" ]]; then
        print_error "Dockerfile not found at $DOCKERFILE"
        exit 1
    fi
}

# Print build information
print_build_info() {
    echo "================================="
    echo "Caesar Air-gapped Image Builder"
    echo "================================="
    echo ""
    echo "This script will build a Caesar Docker image with pre-fetched models for:"
    echo "  • Semantic Search (Jina CLIP v1 & v2)"
    echo "  • Face Recognition (FaceNet & ArcFace)"
    echo "  • License Plate Recognition (PaddleOCR & YOLOv9)"
    echo "  • Bird Classification"
    echo ""
    echo "Image name: $IMAGE_NAME"
    echo "Dockerfile: $DOCKERFILE"
    echo ""
    print_warning "This build will download several GB of model files and may take 30+ minutes."
    echo ""
}

# Ask for confirmation
confirm_build() {
    read -p "Do you want to continue? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Build cancelled."
        exit 0
    fi
}

# Main build function
build_image() {
    print_status "Starting Docker build..."
    echo ""

    # Build with buildx for better output and caching
    if docker buildx version &> /dev/null; then
        print_status "Using Docker Buildx for improved build performance..."
        docker buildx build \
            --tag "$IMAGE_NAME" \
            --file "$DOCKERFILE" \
            --progress=plain \
            "$BUILD_CONTEXT"
    else
        print_status "Using standard Docker build..."
        docker build \
            --tag "$IMAGE_NAME" \
            --file "$DOCKERFILE" \
            "$BUILD_CONTEXT"
    fi
}

# Verify the built image
verify_image() {
    print_status "Verifying the built image..."

    # Check if image exists
    if ! docker image inspect "$IMAGE_NAME" &> /dev/null; then
        print_error "Built image not found!"
        exit 1
    fi

    # Get image size
    IMAGE_SIZE=$(docker image inspect "$IMAGE_NAME" --format='{{.Size}}' | numfmt --to=iec --suffix=B)
    print_status "Image size: $IMAGE_SIZE"

    # Run a quick test to see if models are present
    print_status "Testing model availability in image..."
    docker run --rm "$IMAGE_NAME" find /config/model_cache -name "*.onnx" -o -name "*.tflite" | head -10
}

# Print usage instructions
print_usage() {
    echo ""
    echo "================================="
    echo "Build Complete!"
    echo "================================="
    echo ""
    echo "Your air-gapped Caesar image is ready: $IMAGE_NAME"
    echo ""
    echo "To use this image:"
    echo ""
    echo "1. Save the image to a file:"
    echo "   docker save $IMAGE_NAME | gzip > caesar-airgapped.tar.gz"
    echo ""
    echo "2. Transfer the file to your air-gapped environment"
    echo ""
    echo "3. Load the image on the target system:"
    echo "   docker load < caesar-airgapped.tar.gz"
    echo ""
    echo "4. Run Caesar with your configuration:"
    echo "   docker run -d \\"
    echo "     --name caesar \\"
    echo "     --restart=unless-stopped \\"
    echo "     --mount type=tmpfs,target=/tmp/cache,tmpfs-size=1000000000 \\"
    echo "     --device /dev/bus/usb:/dev/bus/usb \\"
    echo "     --device /dev/dri/renderD128 \\"
    echo "     --shm-size=64m \\"
    echo "     -v /path/to/your/config:/config \\"
    echo "     -v /path/to/your/storage:/media/frigate \\"
    echo "     -v /etc/localtime:/etc/localtime:ro \\"
    echo "     -p 5000:5000 \\"
    echo "     -p 8554:8554 \\"
    echo "     -p 8555:8555/tcp \\"
    echo "     -p 8555:8555/udp \\"
    echo "     $IMAGE_NAME"
    echo ""
    echo "5. Enable features in your config.yml:"
    echo "   semantic_search:"
    echo "     enabled: true"
    echo "   face_recognition:"
    echo "     enabled: true"
    echo "   lpr:"
    echo "     enabled: true"
    echo ""
}

# Main script execution
main() {
    check_docker
    check_directory
    print_build_info
    confirm_build

    BUILD_START=$(date +%s)
    build_image
    BUILD_END=$(date +%s)

    verify_image

    BUILD_TIME=$((BUILD_END - BUILD_START))
    print_status "Build completed in $(($BUILD_TIME / 60)) minutes and $(($BUILD_TIME % 60)) seconds"

    print_usage
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Build a Caesar Docker image with pre-fetched models for air-gapped deployment."
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help message"
        echo "  --force, -f   Skip confirmation prompt"
        echo ""
        exit 0
        ;;
    --force|-f)
        check_docker
        check_directory
        print_build_info
        build_image
        verify_image
        print_usage
        ;;
    *)
        main
        ;;
esac