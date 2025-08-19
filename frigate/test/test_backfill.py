"""Tests for recording backfill functionality."""

import datetime
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from frigate.config import FrigateConfig
from frigate.record.backfill import RecordingBackfillService


class TestRecordingBackfillService(unittest.TestCase):
    def setUp(self):
        self.config = Mock(spec=FrigateConfig)
        self.config.ffmpeg = Mock()
        self.config.cameras = {"test_camera": Mock(), "another_camera": Mock()}
        self.service = RecordingBackfillService(self.config)

    def test_parse_recording_path_valid(self):
        """Test parsing a valid recording path."""
        file_path = "/media/frigate/recordings/2022-01-01/12/test_camera/30.00.mp4"

        with patch.object(self.service, "_get_video_duration", return_value=60.0):
            result = self.service.parse_recording_path(file_path)

        self.assertIsNotNone(result)
        camera_name, start_time, duration = result

        self.assertEqual(camera_name, "test_camera")
        self.assertEqual(duration, 60.0)
        self.assertEqual(start_time.year, 2022)
        self.assertEqual(start_time.month, 1)
        self.assertEqual(start_time.day, 1)
        self.assertEqual(start_time.hour, 12)
        self.assertEqual(start_time.minute, 30)
        self.assertEqual(start_time.second, 0)

    def test_parse_recording_path_invalid_format(self):
        """Test parsing an invalid recording path format."""
        file_path = "/invalid/path/format.mp4"

        result = self.service.parse_recording_path(file_path)

        self.assertIsNone(result)

    def test_parse_recording_path_invalid_filename(self):
        """Test parsing a path with invalid filename format."""
        file_path = "/media/frigate/recordings/2022-01-01/12/test_camera/invalid.mp4"

        result = self.service.parse_recording_path(file_path)

        self.assertIsNone(result)

    def test_scan_directory_for_recordings(self):
        """Test scanning directory for recordings."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create test directory structure
            camera_dir = Path(temp_dir) / "2022-01-01" / "12" / "test_camera"
            camera_dir.mkdir(parents=True)

            # Create test files
            test_file = camera_dir / "30.00.mp4"
            test_file.write_bytes(b"fake video data")

            with patch.object(self.service, "_get_video_duration", return_value=60.0):
                files = self.service.scan_directory_for_recordings(
                    "test_camera", temp_dir
                )

            self.assertEqual(len(files), 1)
            self.assertIn(str(test_file), files)

    def test_scan_directory_for_recordings_wrong_camera(self):
        """Test scanning directory for recordings with wrong camera name."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create test directory structure
            camera_dir = Path(temp_dir) / "2022-01-01" / "12" / "test_camera"
            camera_dir.mkdir(parents=True)

            # Create test files
            test_file = camera_dir / "30.00.mp4"
            test_file.write_bytes(b"fake video data")

            with patch.object(self.service, "_get_video_duration", return_value=60.0):
                files = self.service.scan_directory_for_recordings(
                    "wrong_camera", temp_dir
                )

            self.assertEqual(len(files), 0)

    def test_scan_directory_for_recordings_time_filter(self):
        """Test scanning directory with time filters."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create test directory structure
            camera_dir = Path(temp_dir) / "2022-01-01" / "12" / "test_camera"
            camera_dir.mkdir(parents=True)

            # Create test files
            test_file = camera_dir / "30.00.mp4"
            test_file.write_bytes(b"fake video data")

            # Test start time filter
            start_time = datetime.datetime(
                2022, 1, 1, 12, 31, 0, tzinfo=datetime.timezone.utc
            ).timestamp()

            with patch.object(self.service, "_get_video_duration", return_value=60.0):
                files = self.service.scan_directory_for_recordings(
                    "test_camera", temp_dir, start_time=start_time
                )

            self.assertEqual(len(files), 0)

    def test_backfill_recordings_invalid_camera(self):
        """Test backfill with invalid camera name."""
        result = self.service.backfill_recordings("invalid_camera")

        self.assertFalse(result["success"])
        self.assertIn("not found in configuration", result["message"])

    def test_backfill_recordings_no_files(self):
        """Test backfill when no files are found."""
        with tempfile.TemporaryDirectory() as temp_dir:
            result = self.service.backfill_recordings(
                "test_camera", directory_path=temp_dir
            )

            self.assertTrue(result["success"])
            self.assertEqual(result["total_files_scanned"], 0)
            self.assertEqual(result["files_added"], 0)

    def test_backfill_recordings_uses_negative_one_values(self):
        """Test that backfilled recordings use -1 values for unprocessed data."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create test directory structure
            camera_dir = Path(temp_dir) / "2022-01-01" / "12" / "test_camera"
            camera_dir.mkdir(parents=True)

            # Create test file
            test_file = camera_dir / "30.00.mp4"
            test_file.write_bytes(b"fake video data")

            with patch.object(self.service, "_get_video_duration", return_value=60.0):
                result = self.service.backfill_recordings(
                    "test_camera", directory_path=temp_dir
                )

            self.assertTrue(result["success"])
            self.assertEqual(result["files_added"], 1)

            # Check that the recording was created with -1 values
            from frigate.models import Recordings

            recording = Recordings.get(Recordings.path == str(test_file))
            self.assertEqual(recording.motion, -1)
            self.assertEqual(recording.objects, -1)
            self.assertEqual(recording.dBFS, -1)
            self.assertEqual(recording.regions, -1)

    def test_get_file_size_mb(self):
        """Test getting file size in MB."""
        with tempfile.NamedTemporaryFile() as temp_file:
            # Write 2MB of data
            temp_file.write(b"x" * (2 * 1024 * 1024))
            temp_file.flush()

            size_mb = self.service._get_file_size_mb(temp_file.name)

            self.assertEqual(size_mb, 2.0)

    def test_generate_recording_id(self):
        """Test generating recording ID."""
        start_time = datetime.datetime(
            2022, 1, 1, 12, 30, 0, tzinfo=datetime.timezone.utc
        )

        recording_id = self.service._generate_recording_id(start_time)

        self.assertIsInstance(recording_id, str)
        self.assertIn(str(int(start_time.timestamp())), recording_id)
        self.assertEqual(
            len(recording_id.split("-")[1]), 6
        )  # Random part should be 6 chars


if __name__ == "__main__":
    unittest.main()
