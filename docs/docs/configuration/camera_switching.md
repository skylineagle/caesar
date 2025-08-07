---
id: camera_switching
title: Camera Switching
---

# Camera Switching

Frigate supports automatic detection and handling of camera switches when multiple cameras share the same RTSP URL on different timeslots. This feature prevents stream corruption that can occur when cameras with different video characteristics switch on the same stream.

## Problem Description

When two different cameras alternate on the same RTSP URL, stream corruption can occur because:

- **Different video formats**: Cameras may use different codecs, resolutions, or frame rates
- **Stream buffer corruption**: Data from the first camera remains in buffers when the second camera starts
- **go2rtc connection persistence**: go2rtc maintains connections and doesn't automatically detect format changes
- **FFmpeg process persistence**: FFmpeg processes continue expecting the same stream format

## Solution

Frigate's camera switching detection system monitors stream characteristics and automatically resets connections when a camera switch is detected.

## Configuration

To enable camera switching detection, add the `camera_switching` section to your camera configuration:

```yaml
cameras:
  shared_camera:
    camera_switching:
      enabled: true
      check_interval: 5.0
      reset_cooldown: 30.0
      thresholds:
        resolution_change: true
        codec_change: true
        fps_change_percent: 50.0
        error_spike_count: 5
      go2rtc_api_url: "http://localhost:1984/api"

    ffmpeg:
      inputs:
        - path: rtsp://127.0.0.1:8554/shared_camera
          input_args: preset-rtsp-restream
          roles:
            - detect
            - record

go2rtc:
  streams:
    shared_camera:
      - rtsp://camera_ip/shared_stream_url
```

### Configuration Options

#### Basic Settings

- **`enabled`** (boolean, default: `false`): Enable automatic camera switch detection and stream reset
- **`check_interval`** (float, default: `5.0`): Interval in seconds between stream health checks (1.0-60.0)
- **`reset_cooldown`** (float, default: `30.0`): Minimum seconds between resets for the same camera (5.0-300.0)
- **`go2rtc_api_url`** (string, default: `"http://localhost:1984/api"`): URL for go2rtc API

#### Detection Thresholds

- **`resolution_change`** (boolean, default: `true`): Trigger reset on any resolution change
- **`codec_change`** (boolean, default: `true`): Trigger reset on any codec change
- **`fps_change_percent`** (float, default: `50.0`): Trigger reset when FPS changes by this percentage (0.0-100.0)
- **`error_spike_count`** (integer, default: `5`): Trigger reset when error count reaches this threshold

## How It Works

1. **Stream Monitoring**: The system continuously monitors go2rtc stream metrics including resolution, codec, frame rate, and error counts
2. **Change Detection**: When significant changes are detected that indicate a camera switch, the system triggers a reset
3. **Automatic Reset**: The system automatically:
   - Resets the go2rtc stream connection
   - Terminates and restarts FFmpeg processes
   - Clears any corrupted buffers
   - Waits for the stream to stabilize before resuming

## API Endpoints

### Get System Status

```http
GET /api/camera_switching/status
```

Returns the status of camera switching monitoring for all cameras.

### Get Camera Status

```http
GET /api/camera_switching/{camera_name}/status
```

Returns detailed status for a specific camera's switching monitoring.

### Manual Reset

```http
POST /api/camera_switching/{camera_name}/reset
```

Manually trigger a camera switch reset for a specific camera.

### Cleanup

```http
POST /api/camera_switching/cleanup
```

Manually trigger cleanup of temporary files created by the camera switching system. This removes status files and reset signals.

## Example Response

```json
{
  "camera_name": "shared_camera",
  "enabled": true,
  "config": {
    "enabled": true,
    "check_interval": 5.0,
    "reset_cooldown": 30.0,
    "thresholds": {
      "resolution_change": true,
      "codec_change": true,
      "fps_change_percent": 50.0,
      "error_spike_count": 5
    },
    "go2rtc_api_url": "http://localhost:1984/api"
  },
  "monitoring_active": true,
  "last_reset": "2024-01-15T10:30:00Z",
  "format_changes": 3
}
```

## Troubleshooting

### Common Issues

1. **False Positives**: If resets occur too frequently, increase the thresholds or `reset_cooldown`
2. **Missed Switches**: If switches aren't detected, decrease thresholds or `check_interval`
3. **go2rtc Connection Issues**: Verify the `go2rtc_api_url` is correct and accessible

### Logs

Camera switching events are logged with the `watchdog.{camera_name}` logger. Look for messages like:

```
[INFO] Camera switch detection enabled for shared_camera
[WARNING] Camera switch detected for shared_camera: Resolution changed from 1920x1080 to 1280x720
[INFO] Resetting camera processes for shared_camera due to switch
```

### Manual Testing

You can manually trigger a reset using the API:

```bash
curl -X POST http://your-frigate-ip:5000/api/camera_switching/shared_camera/reset
```

## Best Practices

1. **Use go2rtc**: Always configure your cameras through go2rtc for best results
2. **Monitor Logs**: Watch the logs initially to tune thresholds for your specific cameras
3. **Set Appropriate Intervals**: Balance between detection speed and system load
4. **Test Thoroughly**: Test the switching behavior during typical camera transition times

## Cleanup and Resource Management

The camera switching feature automatically manages its resources and cleans up temporary files:

### Automatic Cleanup

- **On Shutdown**: All temporary files are cleaned up when Frigate shuts down
- **Signal Handlers**: SIGTERM and SIGINT signals trigger automatic cleanup
- **Thread Management**: Monitoring threads are stopped gracefully with timeouts
- **File Cleanup**: Status files and reset signals are automatically removed

### Manual Cleanup

If needed, you can manually trigger cleanup:

```bash
# Via API
curl -X POST http://your-frigate-ip:5000/api/camera_switching/cleanup

# Via command line (inside container)
python -m frigate.camera_switch_cleanup

# Full cleanup including process check
python -m frigate.camera_switch_cleanup --full
```

### System Architecture

The camera switching system uses:

- **Direct Method Calls**: Camera resets are triggered via direct callback functions, not file I/O
- **Global Reset Manager**: Centralized singleton for coordinating resets across all cameras
- **Thread-Safe Communication**: Proper threading primitives instead of file-based signaling
- **Status Files**: Only monitoring status uses temporary files: `frigate_camera_switch_status_{camera_name}`

All resources are automatically cleaned up and will not accumulate over time.

## Limitations

- Requires go2rtc to be properly configured
- Detection depends on stream metadata being available
- Some changes may take a few seconds to detect depending on `check_interval`
- Manual intervention may still be needed for complex stream issues
