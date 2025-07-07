# Frigate Detector Configuration Guide

This guide explains how to configure different detector types in Frigate for optimal performance on various hardware platforms.

## Overview

Frigate supports multiple detector types that work on different hardware:

- **CPU**: Basic TensorFlow Lite models (not recommended for production)
- **OpenVINO**: Intel/AMD GPUs and CPUs
- **TensorRT**: NVIDIA GPUs
- **ONNX**: Multi-platform with various backends
- **Edge TPU**: Google Coral devices
- **RKNN**: Rockchip NPUs
- **Hailo**: Hailo-8 AI accelerators

## Detector Types

### 1. CPU Detector

**Hardware**: Any CPU (not recommended for production)

**Docker Image**: Standard Frigate image

**Configuration**:

```yaml
detectors:
  cpu:
    type: cpu
    num_threads: 3

model:
  path: /cpu_model.tflite
  width: 320
  height: 320
  input_tensor: nhwc
  input_pixel_format: rgb
```

**Notes**:

- Use only for testing or development
- OpenVINO in CPU mode is more efficient
- Performance depends on CPU cores and threads

### 2. OpenVINO Detector

**Hardware**: Intel/AMD GPUs and CPUs

**Docker Image**: Standard Frigate image (built-in support)

**Configuration**:

```yaml
detectors:
  ov:
    type: openvino
    device: GPU # or CPU

model:
  path: /openvino-model/ssdlite_mobilenet_v2.xml
  width: 300
  height: 300
  input_tensor: nhwc
  input_pixel_format: bgr
  labelmap_path: /openvino-model/coco_91cl_bkgr.txt
```

**Supported Models**:

- SSDLite MobileNet v2 (built-in)
- YOLOX (custom models)
- YOLO-NAS (custom models)
- RF-DETR (custom models)
- D-FINE (custom models)

**Performance Examples**:
| Hardware | MobileNetV2 | YOLO-NAS 320 | Notes |
|----------|-------------|--------------|-------|
| Intel HD 530 | 15-35ms | - | Single detector only |
| Intel HD 620 | 15-25ms | ~35ms | |
| Intel UHD 730 | ~10ms | ~19ms | |
| Intel Arc A380 | ~6ms | ~10ms | |
| Intel Arc A750 | ~4ms | ~8ms | |

### 3. TensorRT Detector

**Hardware**: NVIDIA GPUs (Compute Capability 5.0+)

**Docker Image**: `ghcr.io/blakeblackshear/frigate:latest-tensorrt`

**Requirements**:

- NVIDIA driver >= 545
- nvidia-container-runtime
- Compatible GPU

**Configuration**:

```yaml
detectors:
  tensorrt:
    type: tensorrt
    device: 0 # GPU index

model:
  path: /config/model_cache/tensorrt/yolov7-320.trt
  width: 320
  height: 320
  input_tensor: nchw
  input_pixel_format: rgb
  labelmap_path: /labelmap/coco-80.txt
```

**Model Generation**:
TensorRT models are generated at runtime. Set environment variables:

```yaml
frigate:
  environment:
    - YOLO_MODELS=yolov7,yolov8n,yolov8s
    - TRT_MODEL_PREP_DEVICE=0 # Optional: select GPU for conversion
```

**Performance Examples**:
| GPU | YOLOv7 | YOLO-NAS 320 | RF-DETR 336 |
|-----|--------|--------------|-------------|
| GTX 1060 6GB | ~7ms | - | - |
| GTX 1660 SUPER | ~4ms | - | - |
| RTX 3050 | 5-7ms | ~10ms | ~16ms |

### 4. ONNX Detector

**Hardware**: Multi-platform with various backends

**Docker Image**: Standard Frigate image

**Configuration**:

```yaml
detectors:
  onnx:
    type: onnx
    device: GPU # or CPU, Tensorrt, OpenVINO

model:
  path: /config/model_cache/onnx/yolov8n.onnx
  width: 640
  height: 640
  input_tensor: nchw
  input_pixel_format: rgb
  labelmap_path: /labelmap/coco-80.txt
```

**Supported Backends**:

- CPU
- CUDA (NVIDIA GPUs)
- TensorRT (NVIDIA GPUs)
- OpenVINO (Intel/AMD)
- MIGraphX (AMD)

### 5. Edge TPU Detector

**Hardware**: Google Coral devices

**Docker Image**: Standard Frigate image

**Configuration**:

```yaml
detectors:
  coral:
    type: edgetpu
    device: usb # or pci, usb:0, usb:1, etc.

model:
  path: /edgetpu_model.tflite
  width: 320
  height: 320
  input_tensor: nhwc
  input_pixel_format: rgb
```

**Device Options**:

- `usb`: First USB Coral
- `usb:0`, `usb:1`: Specific USB Corals
- `pci`: PCIe/M.2 Coral
- `""`: Native Coral (Dev Board)

### 6. RKNN Detector

**Hardware**: Rockchip devices with NPUs

**Docker Image**: Standard Frigate image

**Configuration**:

```yaml
detectors:
  rknn:
    type: rknn
    num_cores: 3 # Number of NPU cores (0-3)

model:
  path: /config/model_cache/rknn_cache/frigate-fp16-yolov9-c.rknn
  width: 640
  height: 640
  input_tensor: nhwc
  input_pixel_format: rgb
  labelmap_path: /labelmap/coco-80.txt
```

**Supported SoCs**:

- rk3562, rk3566, rk3568, rk3576, rk3588

**Model Conversion**:
Place ONNX models in `/config/model_cache/rknn_cache/onnx/` and run:

```bash
docker exec <container> python3 /opt/conv2rknn.py
```

### 7. Hailo Detector

**Hardware**: Hailo-8 and Hailo-8L AI accelerators

**Docker Image**: Standard Frigate image

**Configuration**:

```yaml
detectors:
  hailo:
    type: hailo8l

model:
  width: 640
  height: 640
  input_tensor: nhwc
  input_pixel_format: rgb
  model_type: yolo-generic
  labelmap_path: /labelmap/coco-80.txt
  # Optional: custom model path
  # path: /config/model_cache/hailo/custom_model.hef
```

## Model Selection

### Built-in Models

Most detectors come with built-in models:

- **CPU**: `/cpu_model.tflite`
- **OpenVINO**: `/openvino-model/ssdlite_mobilenet_v2.xml`
- **Edge TPU**: `/edgetpu_model.tflite`
- **Hailo**: Built-in YOLO models

### Custom Models

For custom models, place them in `/config/model_cache/` and reference them in your configuration.

## Performance Optimization

### Multiple Detectors

You can configure multiple detectors for better performance:

```yaml
detectors:
  ov_0:
    type: openvino
    device: GPU
  ov_1:
    type: openvino
    device: GPU
  ov_2:
    type: openvino
    device: GPU
```

### Model Sizes

Choose appropriate model sizes for your use case:

- **Small models**: Faster inference, lower accuracy
- **Large models**: Slower inference, higher accuracy

### Hardware Considerations

- **GPU memory**: Larger models require more VRAM
- **CPU cores**: More cores allow more detector instances
- **PCIe bandwidth**: Important for multi-GPU setups

## Troubleshooting

### Common Issues

1. **Detector not found**: Check Docker image supports your detector type
2. **Model loading errors**: Verify model path and format
3. **Performance issues**: Check hardware compatibility and model size
4. **Memory errors**: Reduce model size or number of detectors

### Debug Commands

```bash
# Check available detectors
docker exec frigate python3 -c "from frigate.detectors import api_types; print(list(api_types.keys()))"

# Check model files
docker exec frigate find /config/model_cache -name "*.onnx" -o -name "*.tflite" -o -name "*.trt"

# Check detector logs
docker logs frigate | grep -i "detector\|model\|inference"
```

## Migration Guide

### From CPU to Hardware Accelerated

1. **Identify your hardware**: Check what accelerators are available
2. **Choose detector type**: Based on hardware compatibility
3. **Update configuration**: Change detector type and settings
4. **Test performance**: Monitor inference times and accuracy

### Example Migration

**Before (CPU)**:

```yaml
detectors:
  cpu:
    type: cpu
    num_threads: 3
```

**After (OpenVINO)**:

```yaml
detectors:
  ov:
    type: openvino
    device: GPU
```

## Best Practices

1. **Start with built-in models**: They're optimized and tested
2. **Monitor performance**: Use Frigate's built-in metrics
3. **Scale appropriately**: Add detectors as needed
4. **Keep models updated**: Newer models often have better performance
5. **Test thoroughly**: Verify accuracy with your specific use case

## Resources

- [Frigate Documentation](https://docs.frigate.video/)
- [Hardware Acceleration Guide](https://docs.frigate.video/configuration/hardware_acceleration)
- [Object Detectors Documentation](https://docs.frigate.video/configuration/object_detectors)
- [Model Zoo](https://github.com/ultralytics/yolov5) (for custom models)
