#!/usr/bin/env python3
"""
Script to pre-fetch all model files required for Frigate features in air-gapped environments.
This includes models for semantic search, face recognition, LPR, and other features.
"""

import os
import sys
import urllib.request
from pathlib import Path
from typing import List


def download_file(url: str, destination: Path, description: str = ""):
    """Download a file from URL to destination"""
    print(f"Downloading {description or url}...")
    destination.parent.mkdir(parents=True, exist_ok=True)

    # Use a temporary file to avoid partial downloads
    temp_file = destination.with_suffix(destination.suffix + ".tmp")

    try:
        urllib.request.urlretrieve(url, temp_file)
        temp_file.rename(destination)
        print(f"  ✓ Downloaded to {destination}")
    except Exception as e:
        if temp_file.exists():
            temp_file.unlink()
        print(f"  ✗ Failed to download {url}: {e}")
        raise


def download_huggingface_model(model_name: str, files: List[str], base_dir: Path):
    """Download files from HuggingFace model repository"""
    hf_endpoint = os.environ.get("HF_ENDPOINT", "https://huggingface.co")
    model_dir = base_dir / model_name

    for file_name in files:
        if file_name == "tokenizer":
            # Special handling for tokenizer - we'll create placeholder structure
            tokenizer_dir = model_dir / "tokenizer"
            tokenizer_dir.mkdir(parents=True, exist_ok=True)

            # Download tokenizer files
            tokenizer_files = [
                "tokenizer.json",
                "tokenizer_config.json",
                "special_tokens_map.json",
                "vocab.txt",
            ]

            for tf in tokenizer_files:
                try:
                    url = f"{hf_endpoint}/{model_name}/resolve/main/{tf}"
                    download_file(url, tokenizer_dir / tf, f"{model_name} {tf}")
                except:
                    # Some tokenizer files might not exist, that's okay
                    pass
        else:
            url = f"{hf_endpoint}/{model_name}/resolve/main/{file_name}"
            download_file(url, model_dir / file_name, f"{model_name} {file_name}")


def prefetch_semantic_search_models(model_cache_dir: Path):
    """Pre-fetch all semantic search models"""
    print("\n=== Semantic Search Models ===")

    # Jina CLIP v1 models
    jina_v1_files = [
        "onnx/text_model_fp16.onnx",
        "onnx/vision_model_fp16.onnx",
        "onnx/vision_model_quantized.onnx",
        "preprocessor_config.json",
        "tokenizer",  # Special case - handled separately
    ]

    download_huggingface_model("jinaai/jina-clip-v1", jina_v1_files, model_cache_dir)

    # Jina CLIP v2 models
    jina_v2_files = [
        "onnx/model_fp16.onnx",
        "onnx/model_quantized.onnx",
        "preprocessor_config.json",
        "tokenizer",  # Special case - handled separately
    ]

    download_huggingface_model("jinaai/jina-clip-v2", jina_v2_files, model_cache_dir)


def prefetch_face_recognition_models(model_cache_dir: Path):
    """Pre-fetch all face recognition models"""
    print("\n=== Face Recognition Models ===")

    facedet_dir = model_cache_dir / "facedet"

    # Face detection model files
    face_models = {
        "facedet.onnx": "https://github.com/NickM-27/facenet-onnx/releases/download/v1.0/facedet.onnx",
        "landmarkdet.yaml": "https://github.com/NickM-27/facenet-onnx/releases/download/v1.0/landmarkdet.yaml",
        "facenet.tflite": "https://github.com/NickM-27/facenet-onnx/releases/download/v1.0/facenet.tflite",
        "arcface.onnx": "https://github.com/NickM-27/facenet-onnx/releases/download/v1.0/arcface.onnx",
    }

    for filename, url in face_models.items():
        download_file(url, facedet_dir / filename, f"Face model {filename}")


def prefetch_lpr_models(model_cache_dir: Path):
    """Pre-fetch all License Plate Recognition models"""
    print("\n=== License Plate Recognition Models ===")

    # PaddleOCR models
    paddleocr_dir = model_cache_dir / "paddleocr-onnx"
    paddleocr_models = {
        "detection-small.onnx": "https://github.com/hawkeye217/paddleocr-onnx/raw/refs/heads/master/models/detection-small.onnx",
        "detection-large.onnx": "https://github.com/hawkeye217/paddleocr-onnx/raw/refs/heads/master/models/detection-large.onnx",
        "classification.onnx": "https://github.com/hawkeye217/paddleocr-onnx/raw/refs/heads/master/models/classification.onnx",
        "recognition.onnx": "https://github.com/hawkeye217/paddleocr-onnx/raw/refs/heads/master/models/recognition.onnx",
    }

    for filename, url in paddleocr_models.items():
        download_file(url, paddleocr_dir / filename, f"PaddleOCR {filename}")

    # YOLOv9 License Plate Detection model
    yolov9_lp_dir = model_cache_dir / "yolov9_license_plate"
    yolov9_model = "yolov9-256-license-plates.onnx"
    yolov9_url = "https://github.com/hawkeye217/yolov9-license-plates/raw/refs/heads/master/models/yolov9-256-license-plates.onnx"

    download_file(
        yolov9_url, yolov9_lp_dir / yolov9_model, f"YOLOv9 LPR {yolov9_model}"
    )


def prefetch_bird_classification_models(model_cache_dir: Path):
    """Pre-fetch bird classification models"""
    print("\n=== Bird Classification Models ===")

    bird_dir = model_cache_dir / "bird"
    bird_models = {
        "bird.tflite": "https://raw.githubusercontent.com/google-coral/test_data/master/mobilenet_v2_1.0_224_inat_bird_quant.tflite",
        "birdmap.txt": "https://raw.githubusercontent.com/google-coral/test_data/master/inat_bird_labels.txt",
    }

    for filename, url in bird_models.items():
        download_file(url, bird_dir / filename, f"Bird classification {filename}")


def create_model_cache_structure(model_cache_dir: Path):
    """Create the expected model cache directory structure"""
    print(f"\nCreating model cache directory structure at {model_cache_dir}")
    model_cache_dir.mkdir(parents=True, exist_ok=True)

    # Create subdirectories that Frigate expects
    subdirs = [
        "jinaai/jina-clip-v1",
        "jinaai/jina-clip-v2",
        "facedet",
        "paddleocr-onnx",
        "yolov9_license_plate",
        "bird",
        "tensorrt",
        "openvino",
        "rknn_cache",
    ]

    for subdir in subdirs:
        (model_cache_dir / subdir).mkdir(parents=True, exist_ok=True)


def main():
    """Main function to orchestrate model prefetching"""
    # Default model cache directory (can be overridden by environment variable)
    default_cache_dir = Path("/config/model_cache")
    model_cache_dir = Path(os.environ.get("MODEL_CACHE_DIR", default_cache_dir))

    print("Frigate Model Prefetch Script")
    print("============================")
    print(f"Target directory: {model_cache_dir}")
    print("This script will download all model files required for:")
    print("  - Semantic Search (Jina CLIP v1 & v2)")
    print("  - Face Recognition (FaceNet & ArcFace)")
    print("  - License Plate Recognition (PaddleOCR & YOLOv9)")
    print("  - Bird Classification")
    print()

    try:
        # Create directory structure
        create_model_cache_structure(model_cache_dir)

        # Download all model files
        prefetch_semantic_search_models(model_cache_dir)
        prefetch_face_recognition_models(model_cache_dir)
        prefetch_lpr_models(model_cache_dir)
        prefetch_bird_classification_models(model_cache_dir)

        print(f"\n✅ All models successfully downloaded to {model_cache_dir}")
        print("\nTo use these models in an air-gapped environment:")
        print(f"1. Copy the entire {model_cache_dir} directory to your target system")
        print(
            "2. Mount it as a volume in your Frigate container at /config/model_cache"
        )
        print("3. Enable the desired features in your Frigate configuration")

    except Exception as e:
        print(f"\n❌ Error during model prefetch: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
