# Recording Backfill Feature

The recording backfill feature allows you to add missing recording files to the Frigate database. This is useful when you have recording files on disk that were not properly indexed in the database, or when you've manually added recording files to the recordings directory.

## Overview

The backfill feature provides:

1. **API Endpoints** - REST API endpoints for triggering backfill operations
2. **Standalone Script** - Command-line script for manual backfill operations
3. **File Parsing** - Automatic parsing of recording file paths to extract metadata
4. **Database Integration** - Seamless integration with Frigate's existing recording system

## API Endpoints

### Backfill Recordings

**POST** `/recordings/{camera_name}/backfill`

Backfill missing recordings for a specific camera.

**Request Body:**

```json
{
  "start_time": 1640995200,
  "end_time": 1641081600,
  "directory_path": "/custom/recordings/path",
  "dry_run": false,
  "force": false
}
```

**Parameters:**

- `camera_name` (path parameter): Name of the camera to backfill
- `start_time` (optional): Start timestamp for backfill range (UTC)
- `end_time` (optional): End timestamp for backfill range (UTC)
- `directory_path` (optional): Custom directory path to scan for recordings
- `dry_run` (optional): If true, only scan and report without making changes
- `force` (optional): If true, overwrite existing database entries

**Response:**

```json
{
  "success": true,
  "message": "Backfill completed for camera 'front_door'. Scanned 50 files, added 10, skipped 40, errors 0",
  "camera_name": "front_door",
  "total_files_scanned": 50,
  "files_added": 10,
  "files_skipped": 40,
  "files_errors": 0,
  "results": [
    {
      "file_path": "/media/frigate/recordings/2022-01-01/12/front_door/30.00.mp4",
      "start_time": 1640995200.0,
      "end_time": 1640995260.0,
      "duration": 60.0,
      "file_size_mb": 8.5,
      "status": "added"
    }
  ],
  "processing_time_seconds": 2.34
}
```

### Schedule Backfill (Future Feature)

**POST** `/recordings/{camera_name}/backfill/schedule`

Configure automated backfill operations for a camera.

**Request Body:**

```json
{
  "camera_name": "front_door",
  "enabled": true,
  "interval_hours": 24,
  "retention_days": 7
}
```

### Get Backfill Status

**GET** `/recordings/{camera_name}/backfill/status`

Get information about the backfill status for a camera.

## Standalone Script

The backfill functionality is also available as a standalone script:

```bash
# Basic usage
python scripts/backfill_recordings.py --camera front_door

# Dry run to see what would be added
python scripts/backfill_recordings.py --camera front_door --dry-run

# Backfill specific time range
python scripts/backfill_recordings.py --camera front_door --start-time 1640995200 --end-time 1641081600

# Force overwrite existing entries
python scripts/backfill_recordings.py --camera front_door --force

# Use custom directory
python scripts/backfill_recordings.py --camera front_door --directory /custom/recordings/path

# Verbose output
python scripts/backfill_recordings.py --camera front_door --verbose
```

## File Path Format

The backfill feature expects recording files to follow Frigate's standard naming convention:

```
/media/frigate/recordings/YYYY-MM-DD/HH/camera_name/MM.SS.mp4
```

For example:

```
/media/frigate/recordings/2022-01-01/12/front_door/30.00.mp4
```

The script automatically parses:

- Date: `2022-01-01`
- Hour: `12`
- Camera name: `front_door`
- Minutes and seconds: `30.00`

## How It Works

1. **File Discovery**: The service scans the recordings directory (or custom path) for `.mp4` files
2. **Path Parsing**: Each file path is parsed to extract camera name, date, and time information
3. **Metadata Extraction**: Video duration is extracted using ffprobe
4. **Database Check**: The service checks if the recording already exists in the database
5. **Database Insertion**: Missing recordings are added to the database with appropriate metadata
6. **Visual Indication**: Backfilled recordings are marked with -1 values for motion/object detection and will appear with a file icon (📁) and blue styling in the UI

## Use Cases

### Scenario 1: Manual File Addition

You've manually copied recording files to the recordings directory but they're not showing up in the Frigate UI.

```bash
python scripts/backfill_recordings.py --camera front_door --dry-run
```

### Scenario 2: Database Corruption Recovery

After a database issue, some recordings are missing from the database but files still exist on disk.

```bash
python scripts/backfill_recordings.py --camera front_door --force
```

### Scenario 3: Time Range Backfill

You want to backfill recordings for a specific time period.

```bash
python scripts/backfill_recordings.py --camera front_door --start-time 1640995200 --end-time 1641081600
```

### Scenario 4: API Integration

You want to integrate backfill into your automation workflow.

```bash
curl -X POST "http://localhost:5000/recordings/front_door/backfill" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```

## Configuration

The backfill feature uses the existing Frigate configuration for:

- Camera definitions
- FFmpeg settings
- Database connection
- Recording directory paths

No additional configuration is required.

## Security

- All API endpoints require admin authentication
- The feature only processes files within the configured recordings directory
- File paths are validated to prevent directory traversal attacks
- Database operations are performed within transactions

## Limitations

- Only supports the standard Frigate recording file format
- Requires ffprobe for video metadata extraction
- Large directories may take time to process
- Backfilled recordings will have motion/object detection values of -1 (indicating not processed by algorithms)
- Backfilled recordings will be visually distinct in the UI with a file icon (📁) and blue styling instead of video icon (📹)

## Troubleshooting

### Common Issues

1. **"Camera not found" error**

   - Ensure the camera name matches exactly what's in your Frigate configuration
   - Check that the camera is enabled in the configuration

2. **"Invalid recording path format" warnings**

   - Ensure files follow the standard naming convention
   - Check that files are in the correct directory structure

3. **"Could not determine duration" warnings**

   - Ensure ffprobe is available and working
   - Check that video files are not corrupted

4. **Permission errors**
   - Ensure the script has read access to the recordings directory
   - Ensure the script has write access to the database

### Debug Mode

Enable verbose logging to see detailed information:

```bash
python scripts/backfill_recordings.py --camera front_door --verbose
```

### API Debugging

Check the Frigate logs for API-related errors:

```bash
docker logs frigate | grep backfill
```

## Future Enhancements

Planned features for future releases:

- Scheduled automated backfill
- Web UI integration
- Batch processing for multiple cameras
- Progress reporting for large operations
- Integration with existing sync_recordings functionality
