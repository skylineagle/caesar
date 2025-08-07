"""
Cleanup utilities for camera switching feature.

This module provides utilities to clean up resources when Frigate shuts down
or when the camera switching feature is disabled.
"""

import glob
import logging
import os
import signal
import sys

logger = logging.getLogger(__name__)


def cleanup_camera_switch_files():
    """Clean up all temporary files created by camera switching feature."""
    try:
        # Clean up status files (monitoring still uses these)
        status_files = glob.glob("/tmp/frigate_camera_switch_status_*")
        for status_file in status_files:
            try:
                os.unlink(status_file)
                logger.debug(f"Cleaned up status file: {status_file}")
            except Exception as e:
                logger.debug(f"Could not remove status file {status_file}: {e}")

        # Clean up reset manager state
        try:
            from frigate.camera_reset_manager import camera_reset_manager

            camera_reset_manager.cleanup()
            logger.debug("Cleaned up camera reset manager state")
        except Exception as e:
            logger.debug(f"Error cleaning up reset manager: {e}")

        logger.info("Camera switching cleanup completed")

    except Exception as e:
        logger.warning(f"Error during camera switching cleanup: {e}")


def register_cleanup_handlers():
    """Register signal handlers to ensure cleanup on shutdown."""

    def signal_handler(signum, frame):
        """Handle shutdown signals and perform cleanup."""
        logger.info(f"Received signal {signum}, performing camera switching cleanup...")
        cleanup_camera_switch_files()
        # Don't exit here, let the main application handle shutdown

    # Register handlers for common shutdown signals
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # Register cleanup on normal exit
    import atexit

    atexit.register(cleanup_camera_switch_files)


def cleanup_stale_processes():
    """Clean up any stale camera switching processes."""
    try:
        import psutil

        # Look for stale camera switch monitoring threads
        for process in psutil.process_iter(["pid", "name", "cmdline"]):
            try:
                if process.info["name"] and "frigate" in process.info["name"].lower():
                    cmdline = " ".join(process.info["cmdline"] or [])
                    if "camera_switch" in cmdline.lower():
                        # Check if process is actually running
                        if not process.is_running():
                            logger.debug(
                                f"Found stale camera switch process: {process.info['pid']}"
                            )
                            # Process is already dead, just log it
                        else:
                            # Process is running but might be orphaned
                            logger.debug(
                                f"Found running camera switch process: {process.info['pid']}"
                            )
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                # Process disappeared or we don't have access
                continue

    except ImportError:
        # psutil not available, skip process cleanup
        logger.debug("psutil not available, skipping process cleanup")
    except Exception as e:
        logger.warning(f"Error during process cleanup: {e}")


def full_cleanup():
    """Perform comprehensive cleanup of camera switching resources."""
    logger.info("Performing full camera switching cleanup...")

    # Clean up files
    cleanup_camera_switch_files()

    # Clean up stale processes
    cleanup_stale_processes()

    logger.info("Full camera switching cleanup completed")


if __name__ == "__main__":
    # Allow running this script directly for manual cleanup
    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) > 1 and sys.argv[1] == "--full":
        full_cleanup()
    else:
        cleanup_camera_switch_files()
