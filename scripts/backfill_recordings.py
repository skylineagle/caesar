#!/usr/bin/env python3
"""
Recording Backfill Script

This script demonstrates how to use the recording backfill functionality
to add missing recording files to the Frigate database.

Usage:
    python scripts/backfill_recordings.py --camera <camera_name> [options]

Example:
    python scripts/backfill_recordings.py --camera front_door --dry-run
    python scripts/backfill_recordings.py --camera back_yard --start-time 1640995200 --end-time 1641081600
"""

import argparse
import datetime
import logging
import os
import sys
from pathlib import Path

# Add the frigate directory to the Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from frigate.config import FrigateConfig
from frigate.models import init
from frigate.record.backfill import RecordingBackfillService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(
        description="Backfill missing recordings for a camera"
    )
    parser.add_argument(
        "--camera", required=True, help="Name of the camera to backfill"
    )
    parser.add_argument(
        "--config",
        default="/config/config.yml",
        help="Path to Frigate config file (default: /config/config.yml)",
    )
    parser.add_argument(
        "--directory", help="Custom directory path to scan for recordings"
    )
    parser.add_argument(
        "--start-time", type=float, help="Start timestamp for backfill range (UTC)"
    )
    parser.add_argument(
        "--end-time", type=float, help="End timestamp for backfill range (UTC)"
    )
    parser.add_argument("--date", help="Filter by specific date (format: YYYY-MM-DD)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only scan and report without making changes",
    )
    parser.add_argument(
        "--force", action="store_true", help="Overwrite existing database entries"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable verbose logging"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Load Frigate configuration
    try:
        if not os.path.exists(args.config):
            logger.error(f"Config file not found: {args.config}")
            logger.info("Common config file locations:")
            logger.info("  - /config/config.yml (Docker)")
            logger.info("  - ./config.yml (local development)")
            logger.info("  - /etc/frigate/config.yml (system install)")
            return 1

        with open(args.config, "r") as f:
            config_data = f.read()
        config = FrigateConfig.parse_yaml(config_data)
    except Exception as e:
        logger.error(f"Failed to load configuration from {args.config}: {e}")
        return 1

    # Validate camera exists
    if args.camera not in config.cameras:
        logger.error(f"Camera '{args.camera}' not found in configuration")
        logger.info(f"Available cameras: {list(config.cameras.keys())}")
        return 1

    # Initialize database
    init(config.database.path)

    # Create backfill service
    backfill_service = RecordingBackfillService(config)

    # Convert timestamps to datetime for display
    start_time_str = None
    end_time_str = None
    if args.start_time:
        start_time_str = datetime.datetime.fromtimestamp(
            args.start_time, tz=datetime.timezone.utc
        ).isoformat()
    if args.end_time:
        end_time_str = datetime.datetime.fromtimestamp(
            args.end_time, tz=datetime.timezone.utc
        ).isoformat()

    logger.info(f"Starting backfill for camera: {args.camera}")
    if args.directory:
        logger.info(f"Scanning directory: {args.directory}")
    if start_time_str:
        logger.info(f"Start time: {start_time_str}")
    if end_time_str:
        logger.info(f"End time: {end_time_str}")
    if args.dry_run:
        logger.info("DRY RUN MODE - No changes will be made")
    if args.force:
        logger.info("FORCE MODE - Existing entries will be overwritten")

    # Perform backfill
    try:
        result = backfill_service.backfill_recordings(
            camera_name=args.camera,
            directory_path=args.directory,
            start_time=args.start_time,
            end_time=args.end_time,
            date_filter=args.date,
            dry_run=args.dry_run,
            force=args.force,
        )

        # Display results
        print("\n" + "=" * 60)
        print("BACKFILL RESULTS")
        print("=" * 60)
        print(f"Success: {result['success']}")
        print(f"Message: {result['message']}")
        print(f"Camera: {result['camera_name']}")
        print(f"Total files scanned: {result['total_files_scanned']}")
        print(f"Files added: {result['files_added']}")
        print(f"Files skipped: {result['files_skipped']}")
        print(f"Files with errors: {result['files_errors']}")
        print(f"Processing time: {result['processing_time_seconds']:.2f} seconds")

        if result["results"]:
            print("\nDetailed Results:")
            print("-" * 60)
            for file_result in result["results"]:
                status_icon = {
                    "added": "✅",
                    "updated": "🔄",
                    "skipped": "⏭️",
                    "would_add": "📝",
                    "error": "❌",
                }.get(file_result["status"], "❓")

                print(f"{status_icon} {file_result['file_path']}")
                if file_result["status"] != "error":
                    start_time = datetime.datetime.fromtimestamp(
                        file_result["start_time"], tz=datetime.timezone.utc
                    )
                    end_time = datetime.datetime.fromtimestamp(
                        file_result["end_time"], tz=datetime.timezone.utc
                    )
                    print(
                        f"    Time: {start_time.strftime('%Y-%m-%d %H:%M:%S')} - {end_time.strftime('%H:%M:%S')}"
                    )
                    print(
                        f"    Duration: {file_result['duration']:.1f}s, Size: {file_result['file_size_mb']:.2f}MB"
                    )
                print()

        return 0 if result["success"] else 1

    except Exception as e:
        logger.error(f"Error during backfill operation: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
