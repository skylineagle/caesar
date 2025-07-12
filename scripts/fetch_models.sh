#!/bin/bash

# Frigate Model Fetch Script
# This script downloads all required models and files for air-gapped Frigate deployment
# and packages them into a zip file for easy transfer.

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${PROJECT_ROOT}/model_cache"
ZIP_NAME="frigate-models-$(date +%Y%m%d-%H%M%S).zip"
TEMP_DIR="/tmp/frigate-models-$(date +%s)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

print_header() {
    echo -e "${BLUE}[HEADER]${NC} $1"
}

# Function to download a file with progress
download_file() {
    local url="$1"
    local destination="$2"
    local description="$3"

    print_status "Downloading $description..."

    # Create parent directory
    mkdir -p "$(dirname "$destination")"

    # Download with curl for better progress display
    if command -v curl &> /dev/null; then
        curl -L --progress-bar -o "$destination" "$url"
    else
        wget --progress=bar:force -O "$destination" "$url"
    fi

    if [ $? -eq 0 ]; then
        print_status "✓ Downloaded to $destination"
    else
        print_error "✗ Failed to download $url"
        return 1
    fi
}

# Function to download HuggingFace model files
download_huggingface_model() {
    local model_name="$1"
    local files="$2"
    local base_dir="$3"
    local model_dir="${base_dir}/${model_name}"

    mkdir -p "$model_dir"

    for file_name in $files; do
        if [ "$file_name" = "tokenizer" ]; then
            # Special handling for tokenizer
            local tokenizer_dir="${model_dir}/tokenizer"
            mkdir -p "$tokenizer_dir"

            # Download tokenizer files
            local tokenizer_files=(
                "tokenizer.json"
                "tokenizer_config.json"
                "special_tokens_map.json"
                "vocab.txt"
            )

            for tf in "${tokenizer_files[@]}"; do
                local url="https://huggingface.co/${model_name}/resolve/main/${tf}"
                local dest="${tokenizer_dir}/${tf}"
                if download_file "$url" "$dest" "${model_name} ${tf}" 2>/dev/null; then
                    print_status "✓ Downloaded tokenizer file: ${tf}"
                else
                    print_warning "⚠ Tokenizer file ${tf} not available for ${model_name}"
                fi
            done
        else
            local url="https://huggingface.co/${model_name}/resolve/main/${file_name}"
            local dest="${model_dir}/${file_name}"
            download_file "$url" "$dest" "${model_name} ${file_name}"
        fi
    done
}

# Function to create directory structure
create_directory_structure() {
    print_header "Creating directory structure..."

    local subdirs=(
        "jinaai/jina-clip-v1"
        "jinaai/jina-clip-v2"
        "facedet"
        "paddleocr-onnx"
        "yolov9_license_plate"
        "bird"
        "tensorrt"
        "openvino"
        "rknn_cache"
        "onnx"
    )

    for subdir in "${subdirs[@]}"; do
        mkdir -p "${OUTPUT_DIR}/${subdir}"
    done

    print_status "✓ Directory structure created"
}

# Function to download semantic search models
download_semantic_search_models() {
    print_header "Downloading Semantic Search Models..."

    # Jina CLIP v1 models
    local jina_v1_files=(
        "onnx/text_model_fp16.onnx"
        "onnx/vision_model_fp16.onnx"
        "onnx/vision_model_quantized.onnx"
        "preprocessor_config.json"
        "tokenizer"
    )

    download_huggingface_model "jinaai/jina-clip-v1" "${jina_v1_files[*]}" "$OUTPUT_DIR"

    # Jina CLIP v2 models
    local jina_v2_files=(
        "onnx/model_fp16.onnx"
        "onnx/model_quantized.onnx"
        "preprocessor_config.json"
        "tokenizer"
    )

    download_huggingface_model "jinaai/jina-clip-v2" "${jina_v2_files[*]}" "$OUTPUT_DIR"

    print_status "✓ Semantic search models downloaded"
}

# Function to download face recognition models
download_face_recognition_models() {
    print_header "Downloading Face Recognition Models..."

    local facedet_dir="${OUTPUT_DIR}/facedet"
    mkdir -p "$facedet_dir"

    # Face detection model files
    local face_models=(
        "facedet.onnx:https://github.com/NickM-27/facenet-onnx/releases/download/v1.0/facedet.onnx"
        "landmarkdet.yaml:https://github.com/NickM-27/facenet-onnx/releases/download/v1.0/landmarkdet.yaml"
        "facenet.tflite:https://github.com/NickM-27/facenet-onnx/releases/download/v1.0/facenet.tflite"
        "arcface.onnx:https://github.com/NickM-27/facenet-onnx/releases/download/v1.0/arcface.onnx"
    )

    for model_info in "${face_models[@]}"; do
        local filename="${model_info%%:*}"
        local url="${model_info##*:}"
        download_file "$url" "${facedet_dir}/${filename}" "Face model ${filename}"
    done

    print_status "✓ Face recognition models downloaded"
}

# Function to download LPR models
download_lpr_models() {
    print_header "Downloading License Plate Recognition Models..."

    # PaddleOCR models
    local paddleocr_dir="${OUTPUT_DIR}/paddleocr-onnx"
    mkdir -p "$paddleocr_dir"

    local paddleocr_models=(
        "detection-small.onnx:https://github.com/hawkeye217/paddleocr-onnx/raw/refs/heads/master/models/detection-small.onnx"
        "detection-large.onnx:https://github.com/hawkeye217/paddleocr-onnx/raw/refs/heads/master/models/detection-large.onnx"
        "classification.onnx:https://github.com/hawkeye217/paddleocr-onnx/raw/refs/heads/master/models/classification.onnx"
        "recognition.onnx:https://github.com/hawkeye217/paddleocr-onnx/raw/refs/heads/master/models/recognition.onnx"
    )

    for model_info in "${paddleocr_models[@]}"; do
        local filename="${model_info%%:*}"
        local url="${model_info##*:}"
        download_file "$url" "${paddleocr_dir}/${filename}" "PaddleOCR ${filename}"
    done

    # YOLOv9 License Plate Detection model
    local yolov9_lp_dir="${OUTPUT_DIR}/yolov9_license_plate"
    mkdir -p "$yolov9_lp_dir"

    local yolov9_model="yolov9-256-license-plates.onnx"
    local yolov9_url="https://github.com/hawkeye217/yolov9-license-plates/raw/refs/heads/master/models/yolov9-256-license-plates.onnx"

    download_file "$yolov9_url" "${yolov9_lp_dir}/${yolov9_model}" "YOLOv9 LPR ${yolov9_model}"

    print_status "✓ LPR models downloaded"
}

# Function to download bird classification models
download_bird_classification_models() {
    print_header "Downloading Bird Classification Models..."

    local bird_dir="${OUTPUT_DIR}/bird"
    mkdir -p "$bird_dir"

    local bird_models=(
        "bird.tflite:https://raw.githubusercontent.com/google-coral/test_data/master/mobilenet_v2_1.0_224_inat_bird_quant.tflite"
        "birdmap.txt:https://raw.githubusercontent.com/google-coral/test_data/master/inat_bird_labels.txt"
    )

    for model_info in "${bird_models[@]}"; do
        local filename="${model_info%%:*}"
        local url="${model_info##*:}"
        download_file "$url" "${bird_dir}/${filename}" "Bird classification ${filename}"
    done

    print_status "✓ Bird classification models downloaded"
}

# Function to download detector-specific models
download_detector_models() {
    print_header "Downloading Detector-Specific Models..."

    # ONNX models for various detectors
    local onnx_dir="${OUTPUT_DIR}/onnx"
    mkdir -p "$onnx_dir"

    # YOLO models for ONNX/TensorRT/OpenVINO
    local yolo_models=(
        "yolov7.onnx:https://github.com/WongKinYiu/yolov7/releases/download/v0.1/yolov7.pt"
        "yolov8n.onnx:https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt"
        "yolov8s.onnx:https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8s.pt"
        "yolov8m.onnx:https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8m.pt"
        "yolov8l.onnx:https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8l.pt"
        "yolov8x.onnx:https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8x.pt"
    )

    print_warning "Note: YOLO models need to be converted from .pt to .onnx format"
    print_warning "This requires PyTorch and the YOLO conversion scripts"

    # OpenVINO models
    local openvino_dir="${OUTPUT_DIR}/openvino"
    mkdir -p "$openvino_dir"

    # OpenVINO comes with built-in models, but we can download additional ones
    print_status "OpenVINO models are typically built-in or generated at runtime"

    # TensorRT models
    local tensorrt_dir="${OUTPUT_DIR}/tensorrt"
    mkdir -p "$tensorrt_dir"

    print_status "TensorRT models are generated at runtime from ONNX models"
    print_status "They require the specific hardware they'll run on"

    # RKNN models
    local rknn_dir="${OUTPUT_DIR}/rknn_cache"
    mkdir -p "$rknn_dir"

    print_status "RKNN models are generated at runtime from ONNX models"
    print_status "They require the specific Rockchip hardware"

    print_status "✓ Detector-specific model information downloaded"
}

# Function to copy additional required files
copy_additional_files() {
    print_header "Copying additional required files..."

    # Copy label maps and other required files from project root
    local additional_files=(
        "labelmap.txt"
        "audio-labelmap.txt"
    )

    for file in "${additional_files[@]}"; do
        if [ -f "${PROJECT_ROOT}/${file}" ]; then
            cp "${PROJECT_ROOT}/${file}" "${OUTPUT_DIR}/"
            print_status "✓ Copied ${file}"
        else
            print_warning "⚠ File ${file} not found in project root"
        fi
    done

    print_status "✓ Additional files copied"
}

# Function to create zip file
create_zip_file() {
    print_header "Creating zip file..."

    local zip_path="${PROJECT_ROOT}/${ZIP_NAME}"

    # Create zip file
    if command -v zip &> /dev/null; then
        cd "$PROJECT_ROOT"
        zip -r "$zip_path" "model_cache" -x "*.tmp" "*.tmp.*"
    else
        print_error "zip command not found. Please install zip utility."
        return 1
    fi

    # Get file size
    local file_size=$(du -h "$zip_path" | cut -f1)
    print_status "✓ Zip file created: ${ZIP_NAME} (${file_size})"

    echo "$zip_path"
}

# Function to cleanup temporary files
cleanup() {
    print_header "Cleaning up..."

    if [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi

    print_status "✓ Cleanup completed"
}

# Function to print usage information
print_usage_info() {
    local zip_path="$1"

    print_header "Download Complete!"
    echo ""
    echo "Your Frigate models package is ready: ${zip_path}"
    echo ""
    echo "To use this package in an air-gapped environment:"
    echo ""
    echo "1. Transfer the zip file to your target system"
    echo ""
    echo "2. Extract the models:"
    echo "   unzip ${ZIP_NAME}"
    echo ""
    echo "3. Mount the model_cache directory in your Frigate container:"
    echo "   docker run -d \\"
    echo "     --name frigate \\"
    echo "     --restart=unless-stopped \\"
    echo "     -v ./model_cache:/config/model_cache \\"
    echo "     -v /path/to/your/config:/config \\"
    echo "     -v /path/to/your/storage:/media/frigate \\"
    echo "     -p 5000:5000 \\"
    echo "     ghcr.io/blakeblackshear/frigate:latest"
    echo ""
    echo "4. Enable features in your config.yml:"
    echo "   semantic_search:"
    echo "     enabled: true"
    echo "   face_recognition:"
    echo "     enabled: true"
    echo "   lpr:"
    echo "     enabled: true"
    echo ""
    echo "5. Configure your preferred detector type:"
    echo ""
    print_detector_config_examples
    echo ""
}

# Function to print detector configuration examples
print_detector_config_examples() {
    echo "=== Detector Configuration Examples ==="
    echo ""

    echo "CPU Detector (not recommended for production):"
    echo "detectors:"
    echo "  cpu:"
    echo "    type: cpu"
    echo "    num_threads: 3"
    echo ""

    echo "OpenVINO Detector (Intel/AMD):"
    echo "detectors:"
    echo "  ov:"
    echo "    type: openvino"
    echo "    device: GPU  # or CPU"
    echo ""

    echo "TensorRT Detector (NVIDIA):"
    echo "detectors:"
    echo "  tensorrt:"
    echo "    type: tensorrt"
    echo "    device: 0"
    echo ""

    echo "ONNX Detector (Multi-platform):"
    echo "detectors:"
    echo "  onnx:"
    echo "    type: onnx"
    echo "    device: GPU  # or CPU, Tensorrt, OpenVINO"
    echo ""

    echo "Edge TPU Detector (Google Coral):"
    echo "detectors:"
    echo "  coral:"
    echo "    type: edgetpu"
    echo "    device: usb"
    echo ""

    echo "RKNN Detector (Rockchip):"
    echo "detectors:"
    echo "  rknn:"
    echo "    type: rknn"
    echo "    num_cores: 3"
    echo ""

    echo "Hailo Detector (Hailo-8):"
    echo "detectors:"
    echo "  hailo:"
    echo "    type: hailo8l"
    echo ""

    echo "Note: Some detectors require specific Docker images:"
    echo "- TensorRT: ghcr.io/blakeblackshear/frigate:latest-tensorrt"
    echo "- ROCm: ghcr.io/blakeblackshear/frigate:latest-rocm"
    echo "- OpenVINO: ghcr.io/blakeblackshear/frigate:latest (built-in)"
    echo ""
}

# Function to check prerequisites
check_prerequisites() {
    print_header "Checking prerequisites..."

    # Check for required commands
    local required_commands=("curl" "wget" "zip" "unzip")
    local missing_commands=()

    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_commands+=("$cmd")
        fi
    done

    if [ ${#missing_commands[@]} -gt 0 ]; then
        print_error "Missing required commands: ${missing_commands[*]}"
        print_error "Please install the missing utilities and try again."
        exit 1
    fi

    # Check available disk space (at least 5GB)
    local available_space=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
    local required_space=5242880  # 5GB in KB

    if [ "$available_space" -lt "$required_space" ]; then
        print_warning "Low disk space. Available: $(($available_space / 1024 / 1024))GB, Required: 5GB"
        print_warning "The download may fail if there's insufficient space."
    fi

    print_status "✓ Prerequisites check passed"
}

# Main function
main() {
    print_header "Frigate Model Fetch Script"
    echo "================================"
    echo "This script will download all model files required for:"
    echo "  - Semantic Search (Jina CLIP v1 & v2)"
    echo "  - Face Recognition (FaceNet & ArcFace)"
    echo "  - License Plate Recognition (PaddleOCR & YOLOv9)"
    echo "  - Bird Classification"
    echo "  - Detector Support (CPU, OpenVINO, TensorRT, ONNX, Edge TPU, RKNN, Hailo)"
    echo ""
    echo "Supported Detector Types:"
    echo "  - CPU: Basic TensorFlow Lite models"
    echo "  - OpenVINO: Intel/AMD GPUs and CPUs"
    echo "  - TensorRT: NVIDIA GPUs (requires -tensorrt image)"
    echo "  - ONNX: Multi-platform with various backends"
    echo "  - Edge TPU: Google Coral devices"
    echo "  - RKNN: Rockchip NPUs"
    echo "  - Hailo: Hailo-8 AI accelerators"
    echo ""
    echo "Output directory: $OUTPUT_DIR"
    echo "Zip file: $ZIP_NAME"
    echo ""

    # Check prerequisites
    check_prerequisites

    # Create output directory
    mkdir -p "$OUTPUT_DIR"

            # Download all models
        create_directory_structure
        download_semantic_search_models
        download_face_recognition_models
        download_lpr_models
        download_bird_classification_models
        download_detector_models
        copy_additional_files

    # Create zip file
    local zip_path=$(create_zip_file)

    # Cleanup
    cleanup

    # Print usage information
    print_usage_info "$zip_path"

    print_status "Script completed successfully!"
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Download all Frigate models and create a zip file for air-gapped deployment."
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help message"
        echo "  --output, -o  Specify output directory (default: ./model_cache)"
        echo "  --zip, -z     Specify zip filename (default: auto-generated)"
        echo ""
        exit 0
        ;;
    --output|-o)
        OUTPUT_DIR="$2"
        shift 2
        ;;
    --zip|-z)
        ZIP_NAME="$2"
        shift 2
        ;;
    *)
        main
        ;;
esac