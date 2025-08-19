"""Recording backfill service for adding missing recordings to database."""

import datetime
import logging
import os
import random
import string
import time
from pathlib import Path
from typing import List, Optional, Tuple

from peewee import DoesNotExist

from frigate.config import FrigateConfig
from frigate.const import RECORD_DIR
from frigate.models import Recordings
from frigate.util.services import get_video_properties

logger = logging.getLogger(__name__)


class RecordingBackfillService:
    def __init__(self, config: FrigateConfig):
        self.config = config
        self._duration_cache = {}  # Cache for video duration results

    def parse_recording_path(
        self, file_path: str
    ) -> Optional[Tuple[str, datetime.datetime, float]]:
        """Parse a recording file path to extract camera name, start time, and duration.

        Args:
            file_path: Path to the recording file

        Returns:
            Tuple of (camera_name, start_time, duration) or None if parsing fails
        """
        try:
            path = Path(file_path)
            if not path.exists() or not path.is_file():
                logger.debug(f"File does not exist: {file_path}")
                return None

            # Check if file is actually readable and has content
            try:
                file_size = path.stat().st_size
                if file_size == 0:
                    logger.debug(f"File is empty: {file_path}")
                    return None
                # Skip files smaller than 1KB as they're likely not valid video files
                if file_size < 1024:
                    logger.debug(
                        f"File too small to be valid video: {file_path} ({file_size} bytes)"
                    )
                    return None
            except OSError:
                logger.debug(f"Cannot access file: {file_path}")
                return None

            # Expected format: /media/frigate/recordings/YYYY-MM-DD/HH/camera_name/MM.SS.mp4
            parts = path.parts

            # Find the recordings directory index
            try:
                recordings_idx = parts.index("recordings")
            except ValueError:
                logger.debug(
                    f"Invalid recording path format (no 'recordings' directory): {file_path}"
                )
                return None

            if len(parts) < recordings_idx + 4:
                logger.debug(
                    f"Invalid recording path format (insufficient parts): {file_path}"
                )
                return None

            # Extract date and time components
            date_str = parts[recordings_idx + 1]  # YYYY-MM-DD
            hour_str = parts[recordings_idx + 2]  # HH
            camera_name = parts[recordings_idx + 3]  # camera_name
            filename = parts[recordings_idx + 4]  # MM.SS.mp4

            # Parse the filename to get minutes and seconds
            if not filename.endswith(".mp4"):
                logger.debug(f"Invalid recording file format (not .mp4): {filename}")
                return None

            time_part = filename[:-4]  # Remove .mp4
            if "." not in time_part:
                logger.debug(f"Invalid time format in filename: {filename}")
                return None

            minute_str, second_str = time_part.split(".")

            # Construct datetime string and parse
            datetime_str = f"{date_str} {hour_str}:{minute_str}:{second_str}"
            start_time = datetime.datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")
            start_time = start_time.replace(tzinfo=datetime.timezone.utc)

            # Get video duration using ffprobe
            duration = self._get_video_duration(file_path)
            if duration is None:
                logger.debug(f"Could not determine duration for: {file_path}")
                return None

            return camera_name, start_time, duration

        except Exception as e:
            logger.debug(f"Error parsing recording path {file_path}: {e}")
            return None

    def _get_video_duration(self, file_path: str) -> Optional[float]:
        """Get video duration using ffprobe."""
        # Check cache first
        if file_path in self._duration_cache:
            return self._duration_cache[file_path]

        try:
            import asyncio

            # Run the async function in a new event loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                segment_info = loop.run_until_complete(
                    get_video_properties(
                        self.config.ffmpeg, file_path, get_duration=True
                    )
                )
                duration = (
                    float(segment_info.get("duration", 0))
                    if segment_info.get("duration")
                    else None
                )
                # Cache the result
                self._duration_cache[file_path] = duration
                return duration
            finally:
                loop.close()
        except Exception as e:
            logger.error(f"Error getting video duration for {file_path}: {e}")
            # Cache None to avoid repeated failures
            self._duration_cache[file_path] = None
            return None

    def _get_file_size_mb(self, file_path: str) -> float:
        """Get file size in MB."""
        try:
            return round(float(os.path.getsize(file_path)) / (1024 * 1024), 2)
        except OSError:
            return 0.0

    def _generate_recording_id(self, start_time: datetime.datetime) -> str:
        """Generate a unique recording ID."""
        rand_id = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
        return f"{start_time.timestamp()}-{rand_id}"

    def scan_directory_for_recordings(
        self,
        camera_name: str,
        directory_path: Optional[str] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        date_filter: Optional[str] = None,  # Format: "YYYY-MM-DD"
    ) -> List[str]:
        """Scan directory for recording files for a specific camera.

        Args:
            camera_name: Name of the camera to scan for
            directory_path: Custom directory path to scan (defaults to RECORD_DIR)
            start_time: Optional start timestamp filter
            end_time: Optional end timestamp filter

        Returns:
            List of file paths found
        """
        if directory_path is None:
            directory_path = RECORD_DIR

        recording_files = []

        try:
            base_path = Path(directory_path)
            print(f"DEBUG: Scanning base path: {base_path}")
            if not base_path.exists():
                print(f"DEBUG: Directory does not exist: {directory_path}")
                logger.warning(f"Directory does not exist: {directory_path}")
                return recording_files

            # Walk through all subdirectories looking for .mp4 files
            print("DEBUG: Starting directory walk...")
            file_count = 0

            # If date filter is provided, only scan that specific date directory
            if date_filter is not None:
                date_path = base_path / date_filter
                if not date_path.exists():
                    print(f"DEBUG: Date directory does not exist: {date_path}")
                    return recording_files
                scan_paths = [date_path]
            else:
                scan_paths = [base_path]

            for scan_path in scan_paths:
                for root, dirs, files in os.walk(scan_path):
                    for file in files:
                        if file.endswith(".mp4") and not file.startswith("preview_"):
                            file_path = os.path.join(root, file)
                            file_count += 1
                            if (
                                file_count <= 5
                            ):  # Only print first 5 files for debugging
                                print(f"DEBUG: Found file: {file_path}")

                            # Parse the file path to get camera and time info
                            parsed = self.parse_recording_path(file_path)
                            if parsed is None:
                                continue

                            file_camera, file_start_time, _ = parsed

                            # Check if this file belongs to the target camera
                            if file_camera != camera_name:
                                continue

                            # Apply date filter if provided (double-check)
                            if date_filter is not None:
                                file_date = file_start_time.strftime("%Y-%m-%d")
                                if file_date != date_filter:
                                    continue

                            # Apply time filters if provided
                            if (
                                start_time is not None
                                and file_start_time.timestamp() < start_time
                            ):
                                continue
                            if (
                                end_time is not None
                                and file_start_time.timestamp() > end_time
                            ):
                                continue

                            recording_files.append(file_path)

        except Exception as e:
            logger.error(f"Error scanning directory {directory_path}: {e}")

        return recording_files

    def backfill_recordings(
        self,
        camera_name: str,
        directory_path: Optional[str] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        date_filter: Optional[str] = None,  # Format: "YYYY-MM-DD"
        dry_run: bool = False,
        force: bool = False,
    ) -> dict:
        """Backfill missing recordings for a camera.

        Args:
            camera_name: Name of the camera to backfill
            directory_path: Custom directory path to scan
            start_time: Optional start timestamp filter
            end_time: Optional end timestamp filter
            dry_run: If True, only scan and report without making changes
            force: If True, overwrite existing database entries

        Returns:
            Dictionary with backfill results
        """
        start_processing = time.time()

        # Validate camera exists
        if camera_name not in self.config.cameras:
            return {
                "success": False,
                "message": f"Camera '{camera_name}' not found in configuration",
                "camera_name": camera_name,
                "total_files_scanned": 0,
                "files_added": 0,
                "files_skipped": 0,
                "files_errors": 0,
                "results": [],
                "processing_time_seconds": 0,
            }

        # Scan for recording files
        print(f"DEBUG: Starting scan for camera: {camera_name}")
        print(f"DEBUG: Directory: {directory_path}")
        if start_time:
            print(
                f"DEBUG: Start time: {start_time} ({datetime.datetime.fromtimestamp(start_time, tz=datetime.timezone.utc)})"
            )
        if end_time:
            print(
                f"DEBUG: End time: {end_time} ({datetime.datetime.fromtimestamp(end_time, tz=datetime.timezone.utc)})"
            )
        if date_filter:
            print(f"DEBUG: Date filter: {date_filter}")

        recording_files = self.scan_directory_for_recordings(
            camera_name, directory_path, start_time, end_time, date_filter
        )

        print(f"DEBUG: Found {len(recording_files)} files to process")
        logger.info(f"Found {len(recording_files)} files to process")

        if not recording_files:
            return {
                "success": True,
                "message": f"No recording files found for camera '{camera_name}' in the specified range",
                "camera_name": camera_name,
                "total_files_scanned": 0,
                "files_added": 0,
                "files_skipped": 0,
                "files_errors": 0,
                "results": [],
                "processing_time_seconds": time.time() - start_processing,
            }

        files_added = 0
        files_skipped = 0
        files_errors = 0
        results = []

        for file_path in recording_files:
            try:
                # Parse file path
                parsed = self.parse_recording_path(file_path)
                if parsed is None:
                    files_errors += 1
                    results.append(
                        {
                            "file_path": file_path,
                            "start_time": 0,
                            "end_time": 0,
                            "duration": 0,
                            "file_size_mb": 0,
                            "status": "error",
                        }
                    )
                    continue

                camera_name, start_time, duration = parsed
                end_time = start_time + datetime.timedelta(seconds=duration)
                file_size_mb = self._get_file_size_mb(file_path)

                # Check if recording already exists in database
                existing_recording = None
                try:
                    existing_recording = Recordings.get(Recordings.path == file_path)
                except DoesNotExist:
                    pass

                if existing_recording and not force:
                    files_skipped += 1
                    results.append(
                        {
                            "file_path": file_path,
                            "start_time": start_time.timestamp(),
                            "end_time": end_time.timestamp(),
                            "duration": duration,
                            "file_size_mb": file_size_mb,
                            "status": "skipped",
                        }
                    )
                    continue

                if dry_run:
                    files_added += 1
                    results.append(
                        {
                            "file_path": file_path,
                            "start_time": start_time.timestamp(),
                            "end_time": end_time.timestamp(),
                            "duration": duration,
                            "file_size_mb": file_size_mb,
                            "status": "would_add",
                        }
                    )
                    continue

                # Create database entry
                recording_id = self._generate_recording_id(start_time)

                recording_data = {
                    Recordings.id: recording_id,
                    Recordings.camera: camera_name,
                    Recordings.path: file_path,
                    Recordings.start_time: start_time.timestamp(),
                    Recordings.end_time: end_time.timestamp(),
                    Recordings.duration: duration,
                    Recordings.motion: -1,  # -1 indicates not processed by algorithms
                    Recordings.objects: -1,  # -1 indicates not processed by algorithms
                    Recordings.dBFS: -1,  # -1 indicates not processed by algorithms
                    Recordings.segment_size: file_size_mb,
                    Recordings.regions: -1,  # -1 indicates not processed by algorithms
                }

                if existing_recording and force:
                    # Update existing record
                    Recordings.update(recording_data).where(
                        Recordings.id == existing_recording.id
                    ).execute()
                    status = "updated"
                else:
                    # Insert new record
                    Recordings.insert(recording_data).execute()
                    status = "added"

                files_added += 1
                results.append(
                    {
                        "file_path": file_path,
                        "start_time": start_time.timestamp(),
                        "end_time": end_time.timestamp(),
                        "duration": duration,
                        "file_size_mb": file_size_mb,
                        "status": status,
                    }
                )

            except Exception as e:
                logger.error(f"Error processing recording file {file_path}: {e}")
                files_errors += 1
                results.append(
                    {
                        "file_path": file_path,
                        "start_time": 0,
                        "end_time": 0,
                        "duration": 0,
                        "file_size_mb": 0,
                        "status": "error",
                    }
                )

        processing_time = time.time() - start_processing

        return {
            "success": True,
            "message": f"Backfill completed for camera '{camera_name}'. "
            f"Scanned {len(recording_files)} files, "
            f"added {files_added}, skipped {files_skipped}, errors {files_errors}",
            "camera_name": camera_name,
            "total_files_scanned": len(recording_files),
            "files_added": files_added,
            "files_skipped": files_skipped,
            "files_errors": files_errors,
            "results": results,
            "processing_time_seconds": processing_time,
        }
