# Hot Reloading Configuration

Frigate supports hot reloading for many configuration changes, allowing you to update settings without restarting the entire application. This provides better uptime and faster configuration updates.

## What Can Be Hot Reloaded

The following configuration changes can be applied without restarting Frigate:

### Motion Detection Settings

- Motion threshold
- Motion contour area
- Improve contrast setting
- Motion masks

### Object Detection Settings

- Detection enabled/disabled state
- Detection dimensions (width, height)
- Detection FPS
- Stationary object settings
- Tracked objects list
- Object filters and masks

### Zones

- Zone coordinates
- Zone inertia settings
- Zone loitering time
- Zone speed thresholds
- Zone object lists
- Zone distances (for speed estimation)

### Camera Settings

- Camera enabled/disabled state
- Review alerts and detections zones
- Annotation offset settings

### Notifications

- Global notification settings
- Camera-specific notification settings

## What Requires a Restart

The following configuration changes still require a full restart:

- Camera stream URLs and FFmpeg settings
- Detector configuration (CPU, GPU, Coral settings)
- Model changes
- Database configuration
- MQTT configuration
- Recording settings
- Storage configuration
- Enrichments settings (semantic search, face recognition, LPR)
- Frigate+ model changes

## How It Works

When you make a hot-reloadable configuration change through the web interface, Frigate:

1. Validates the configuration change
2. Updates the configuration in memory
3. Publishes the change to all relevant components via the internal messaging system
4. Components automatically pick up the new configuration and apply it immediately

## Benefits

- **Better Uptime**: No interruption to video processing, recording, or detection
- **Faster Updates**: Configuration changes take effect immediately
- **Live Testing**: You can adjust motion settings and see the effects in real-time
- **Go2RTC Continuity**: Streaming continues uninterrupted during configuration changes

## Usage

Hot reloading is automatically enabled for supported configuration changes. When you save changes in the web interface:

- If the change is hot-reloadable, you'll see "Config successfully updated and applied"
- If the change requires a restart, you'll see "Config successfully updated, restart to apply"

## Troubleshooting

If you experience issues with hot-reloaded configurations:

1. Check the logs for any error messages
2. Verify the configuration is valid
3. If problems persist, restart Frigate to ensure a clean state

## Technical Details

Hot reloading is implemented using:

- **ConfigSubscriber**: Components subscribe to configuration updates
- **ZMQ Messaging**: Internal communication between processes
- **Runtime Configuration Updates**: Dynamic configuration application without restart

The system ensures that configuration changes are applied atomically and consistently across all components.
