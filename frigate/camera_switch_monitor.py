"""
Camera Switch Detection and Stream Reset System for Frigate.

This module provides functionality to detect when cameras sharing the same RTSP URL
switch and automatically reset streams to prevent corruption.
"""

import logging
import os
import threading
import time
from dataclasses import dataclass
from queue import Queue
from typing import Dict, Optional, Tuple

import requests

logger = logging.getLogger(__name__)


@dataclass
class StreamMetrics:
    """Metrics for tracking stream health and characteristics."""

    width: int = 0
    height: int = 0
    fps: float = 0.0
    codec: str = ""
    bitrate: int = 0
    last_update: float = 0.0
    error_count: int = 0
    format_changes: int = 0


class CameraSwitchDetector:
    """
    Detects when cameras switch on the same RTSP URL and triggers stream resets.

    This class monitors go2rtc stream metrics and detects significant changes
    that indicate a camera switch has occurred.
    """

    def __init__(
        self, camera_name: str, go2rtc_api_url: str = "http://localhost:1984/api"
    ):
        self.camera_name = camera_name
        self.go2rtc_api_url = go2rtc_api_url
        self.previous_metrics = StreamMetrics()
        self.current_metrics = StreamMetrics()
        self.switch_threshold = {
            "resolution_change": True,  # Any resolution change triggers reset
            "codec_change": True,  # Any codec change triggers reset
            "fps_change_percent": 50,  # FPS change > 50% triggers reset
            "error_spike_count": 5,  # 5+ errors in monitoring period
        }
        self.monitoring_interval = 5.0  # Check every 5 seconds
        self.switch_callbacks: list = []

    def add_switch_callback(self, callback):
        """Add a callback to be called when a camera switch is detected."""
        self.switch_callbacks.append(callback)

    def get_stream_info(self) -> Optional[Dict]:
        """Get stream information from go2rtc API."""
        try:
            response = requests.get(f"{self.go2rtc_api_url}/streams", timeout=5)
            response.raise_for_status()
            streams_data = response.json()
            return streams_data.get(self.camera_name)
        except Exception as e:
            logger.warning(f"Failed to get stream info for {self.camera_name}: {e}")
            return None

    def parse_stream_metrics(self, stream_data: Dict) -> StreamMetrics:
        """Parse stream data to extract relevant metrics."""
        metrics = StreamMetrics()
        metrics.last_update = time.time()

        if not stream_data:
            return metrics

        try:
            # Look for producer information (input stream)
            producers = stream_data.get("producers", [])
            if producers:
                producer = producers[0]  # Take first producer

                # Extract video track info
                for track in producer.get("tracks", []):
                    if track.get("codec", "").startswith("H264") or track.get(
                        "codec", ""
                    ).startswith("H265"):
                        metrics.codec = track.get("codec", "")
                        metrics.fps = track.get("fps", 0.0)
                        metrics.width = track.get("width", 0)
                        metrics.height = track.get("height", 0)
                        metrics.bitrate = track.get("bitrate", 0)
                        break

            # Count consumers (outputs) to detect connection issues
            consumers = stream_data.get("consumers", [])
            metrics.error_count = len([c for c in consumers if c.get("error")])

        except Exception as e:
            logger.warning(f"Error parsing stream metrics for {self.camera_name}: {e}")
            metrics.error_count += 1

        return metrics

    def detect_camera_switch(
        self, current: StreamMetrics, previous: StreamMetrics
    ) -> Tuple[bool, str]:
        """
        Detect if a camera switch occurred based on metrics comparison.

        Returns:
            Tuple of (switch_detected: bool, reason: str)
        """
        if previous.last_update == 0:
            return False, "No previous metrics"

        reasons = []

        # Check for resolution change
        if (
            (current.width != previous.width or current.height != previous.height)
            and current.width > 0
            and current.height > 0
            and previous.width > 0
            and previous.height > 0
        ):
            if self.switch_threshold["resolution_change"]:
                reasons.append(
                    f"Resolution changed from {previous.width}x{previous.height} to {current.width}x{current.height}"
                )

        # Check for codec change
        if current.codec != previous.codec and current.codec and previous.codec:
            if self.switch_threshold["codec_change"]:
                reasons.append(
                    f"Codec changed from {previous.codec} to {current.codec}"
                )

        # Check for significant FPS change
        if current.fps > 0 and previous.fps > 0:
            fps_change_percent = abs(current.fps - previous.fps) / previous.fps * 100
            if fps_change_percent > self.switch_threshold["fps_change_percent"]:
                reasons.append(
                    f"FPS changed by {fps_change_percent:.1f}% ({previous.fps} to {current.fps})"
                )

        # Check for error spike
        if current.error_count >= self.switch_threshold["error_spike_count"]:
            reasons.append(f"Error spike detected ({current.error_count} errors)")

        return len(reasons) > 0, "; ".join(reasons)

    def monitor_stream(self):
        """Main monitoring loop to detect camera switches."""
        logger.info(f"Starting camera switch monitoring for {self.camera_name}")

        try:
            while not getattr(self, "_stop_monitoring", False):
                try:
                    stream_data = self.get_stream_info()
                    self.current_metrics = self.parse_stream_metrics(stream_data)

                    # Detect switch
                    switch_detected, reason = self.detect_camera_switch(
                        self.current_metrics, self.previous_metrics
                    )

                    if switch_detected:
                        logger.warning(
                            f"Camera switch detected for {self.camera_name}: {reason}"
                        )

                        # Increment format change counter
                        self.current_metrics.format_changes = (
                            self.previous_metrics.format_changes + 1
                        )

                        # Trigger callbacks
                        for callback in self.switch_callbacks:
                            try:
                                callback(self.camera_name, reason)
                            except Exception as e:
                                logger.error(f"Error in switch callback: {e}")

                    # Update previous metrics
                    self.previous_metrics = self.current_metrics

                    # Export status for API access
                    self._export_status()

                except Exception as e:
                    logger.error(
                        f"Error in stream monitoring for {self.camera_name}: {e}"
                    )

                # Check for stop signal periodically
                for _ in range(int(self.monitoring_interval)):
                    if getattr(self, "_stop_monitoring", False):
                        break
                    time.sleep(1)

        finally:
            # Cleanup on exit
            self._cleanup()
            logger.info(f"Camera switch monitoring stopped for {self.camera_name}")

    def stop_monitoring(self):
        """Stop the monitoring loop gracefully."""
        self._stop_monitoring = True

    def _export_status(self):
        """Export current status to a file for API access."""
        try:
            status_file = f"/tmp/frigate_camera_switch_status_{self.camera_name}"
            status_data = {
                "monitoring_active": True,
                "last_update": time.time(),
                "format_changes": self.current_metrics.format_changes,
                "current_metrics": {
                    "width": self.current_metrics.width,
                    "height": self.current_metrics.height,
                    "fps": self.current_metrics.fps,
                    "codec": self.current_metrics.codec,
                    "error_count": self.current_metrics.error_count,
                    "last_update": self.current_metrics.last_update,
                },
            }

            with open(status_file, "w") as f:
                import json

                json.dump(status_data, f)
        except Exception as e:
            logger.debug(f"Failed to export status for {self.camera_name}: {e}")

    def _cleanup(self):
        """Clean up resources and temporary files."""
        try:
            # Remove status file
            status_file = f"/tmp/frigate_camera_switch_status_{self.camera_name}"
            if os.path.exists(status_file):
                os.unlink(status_file)

            # Clear callbacks to prevent memory leaks
            self.switch_callbacks.clear()

            logger.debug(f"Cleaned up camera switch detector for {self.camera_name}")
        except Exception as e:
            logger.warning(f"Error during cleanup for {self.camera_name}: {e}")


class StreamResetManager:
    """
    Manages stream resets when camera switches are detected.

    This class handles the coordination between go2rtc stream resets
    and Frigate camera process restarts.
    """

    def __init__(self):
        self.reset_queue = Queue()
        self.go2rtc_api_url = "http://localhost:1984/api"
        self.active_resets = set()
        self.reset_cooldown = 30  # Minimum seconds between resets for same camera
        self.last_reset_times: Dict[str, float] = {}
        self._shutdown = False
        self.camera_reset_callback = None

    def reset_go2rtc_stream(self, camera_name: str) -> bool:
        """Reset a specific go2rtc stream."""
        try:
            # First, try to restart the specific stream
            restart_url = f"{self.go2rtc_api_url}/streams/{camera_name}/restart"
            response = requests.post(restart_url, timeout=10)

            if response.status_code == 200:
                logger.info(f"Successfully restarted go2rtc stream for {camera_name}")
                return True
            else:
                logger.warning(
                    f"go2rtc stream restart returned status {response.status_code}"
                )

        except Exception as e:
            logger.error(f"Failed to restart go2rtc stream for {camera_name}: {e}")

        # Fallback: try to stop and start the stream
        try:
            # Stop stream
            stop_url = f"{self.go2rtc_api_url}/streams/{camera_name}/stop"
            requests.post(stop_url, timeout=5)

            # Wait a moment
            time.sleep(2)

            # Start stream
            start_url = f"{self.go2rtc_api_url}/streams/{camera_name}/start"
            response = requests.post(start_url, timeout=10)

            if response.status_code == 200:
                logger.info(
                    f"Successfully restarted go2rtc stream for {camera_name} via stop/start"
                )
                return True

        except Exception as e:
            logger.error(f"Failed to stop/start go2rtc stream for {camera_name}: {e}")

        return False

    def request_camera_reset(self, camera_name: str, reason: str = ""):
        """Request a camera reset due to detected switch."""
        current_time = time.time()

        # Check cooldown
        if camera_name in self.last_reset_times:
            time_since_last = current_time - self.last_reset_times[camera_name]
            if time_since_last < self.reset_cooldown:
                logger.info(
                    f"Skipping reset for {camera_name} - still in cooldown ({time_since_last:.1f}s)"
                )
                return

        # Prevent concurrent resets
        if camera_name in self.active_resets:
            logger.info(f"Reset already in progress for {camera_name}")
            return

        logger.info(f"Queueing camera reset for {camera_name}: {reason}")
        self.reset_queue.put((camera_name, reason, current_time))

    def execute_camera_reset(self, camera_name: str, reason: str):
        """Execute the actual camera reset process."""
        try:
            self.active_resets.add(camera_name)
            logger.info(f"Executing camera reset for {camera_name}: {reason}")

            # Step 1: Reset go2rtc stream
            self.reset_go2rtc_stream(camera_name)

            # Step 2: Signal Frigate to restart camera processes via callback
            if hasattr(self, "camera_reset_callback") and self.camera_reset_callback:
                try:
                    self.camera_reset_callback(camera_name, reason)
                except Exception as e:
                    logger.error(
                        f"Error in camera reset callback for {camera_name}: {e}"
                    )

            logger.info(f"Camera reset completed for {camera_name}")
            self.last_reset_times[camera_name] = time.time()

        except Exception as e:
            logger.error(f"Error executing camera reset for {camera_name}: {e}")
        finally:
            self.active_resets.discard(camera_name)

    def set_camera_reset_callback(self, callback):
        """Set callback function to trigger camera resets in Frigate."""
        self.camera_reset_callback = callback

    def process_reset_queue(self):
        """Process queued reset requests."""
        while not self._shutdown:
            try:
                camera_name, reason, request_time = self.reset_queue.get(timeout=1)
                if not self._shutdown:  # Double-check shutdown state
                    self.execute_camera_reset(camera_name, reason)
            except Exception:
                continue

        # Cleanup any remaining resets
        logger.info("Reset queue processor shutting down, cleaning up...")
        self._cleanup_reset_signals()

    def shutdown(self):
        """Shutdown the reset manager gracefully."""
        self._shutdown = True
        logger.info("StreamResetManager shutdown requested")

    def _cleanup_reset_signals(self):
        """Clean up any remaining reset signal files."""
        # No longer using file-based signaling, but keep method for compatibility
        pass


class CameraSwitchMonitor:
    """
    Main coordinator class for camera switch detection and stream management.

    This class sets up monitoring for multiple cameras and coordinates
    the detection and reset processes.
    """

    def __init__(self, camera_configs: Dict[str, Dict]):
        self.camera_configs = camera_configs
        self.detectors: Dict[str, CameraSwitchDetector] = {}
        self.reset_manager = StreamResetManager()
        self.monitoring_threads: Dict[str, threading.Thread] = {}
        self.running = False

    def setup_camera_monitoring(self, camera_name: str, config: Dict):
        """Set up monitoring for a specific camera."""
        # Only monitor cameras that use go2rtc and have switching enabled
        if not config.get("camera_switching", {}).get("enabled", False):
            return

        logger.info(f"Setting up camera switch monitoring for {camera_name}")

        detector = CameraSwitchDetector(camera_name)

        # Configure thresholds from camera config
        switching_config = config.get("camera_switching", {})
        if "thresholds" in switching_config:
            detector.switch_threshold.update(switching_config["thresholds"])

        # Set monitoring interval
        detector.monitoring_interval = switching_config.get("check_interval", 5.0)

        # Add reset callback
        detector.add_switch_callback(self.reset_manager.request_camera_reset)

        self.detectors[camera_name] = detector

    def start_monitoring(self):
        """Start monitoring all configured cameras."""
        if self.running:
            return

        self.running = True
        logger.info("Starting camera switch monitoring system")

        # Start reset queue processor
        reset_thread = threading.Thread(
            target=self.reset_manager.process_reset_queue,
            daemon=True,
            name="reset_queue_processor",
        )
        reset_thread.start()

        # Start monitoring threads for each camera
        for camera_name, detector in self.detectors.items():
            thread = threading.Thread(
                target=detector.monitor_stream,
                daemon=True,
                name=f"monitor_{camera_name}",
            )
            thread.start()
            self.monitoring_threads[camera_name] = thread

        logger.info(f"Started monitoring {len(self.detectors)} cameras for switching")

    def stop_monitoring(self):
        """Stop all monitoring activities and cleanup resources."""
        self.running = False
        logger.info("Stopping camera switch monitoring system")

        # Stop all detector threads
        for camera_name, detector in self.detectors.items():
            try:
                detector.stop_monitoring()
                logger.debug(f"Stopped monitoring for {camera_name}")
            except Exception as e:
                logger.warning(f"Error stopping detector for {camera_name}: {e}")

        # Wait for threads to finish (with timeout)
        for camera_name, thread in self.monitoring_threads.items():
            try:
                thread.join(timeout=5)
                if thread.is_alive():
                    logger.warning(f"Thread for {camera_name} did not stop gracefully")
                else:
                    logger.debug(f"Thread for {camera_name} stopped successfully")
            except Exception as e:
                logger.warning(f"Error joining thread for {camera_name}: {e}")

        # Shutdown reset manager
        try:
            self.reset_manager.shutdown()
        except Exception as e:
            logger.warning(f"Error shutting down reset manager: {e}")

        # Clean up all temporary files
        self._cleanup_all_files()

        logger.info("Camera switch monitoring system stopped and cleaned up")

    def _cleanup_all_files(self):
        """Clean up all temporary files created by the monitoring system."""
        try:
            import glob

            # Clean up status files (still used by monitoring)
            status_files = glob.glob("/tmp/frigate_camera_switch_status_*")
            for status_file in status_files:
                try:
                    os.unlink(status_file)
                    logger.debug(f"Cleaned up status file: {status_file}")
                except Exception as e:
                    logger.debug(f"Could not remove status file {status_file}: {e}")

        except Exception as e:
            logger.warning(f"Error during file cleanup: {e}")

    def __del__(self):
        """Destructor to ensure cleanup on object deletion."""
        if self.running:
            self.stop_monitoring()

    def get_status(self) -> Dict:
        """Get status of all monitored cameras."""
        status = {
            "running": self.running,
            "monitored_cameras": len(self.detectors),
            "cameras": {},
        }

        for camera_name, detector in self.detectors.items():
            status["cameras"][camera_name] = {
                "current_metrics": detector.current_metrics.__dict__,
                "format_changes": detector.current_metrics.format_changes,
                "last_reset": self.reset_manager.last_reset_times.get(camera_name, 0),
                "thread_alive": self.monitoring_threads.get(
                    camera_name, threading.Thread()
                ).is_alive(),
            }

        return status


def create_camera_switch_monitor(config: Dict) -> CameraSwitchMonitor:
    """Factory function to create and configure camera switch monitor."""
    camera_configs = {}

    # Extract camera configurations
    for camera_name, camera_config in config.get("cameras", {}).items():
        camera_configs[camera_name] = camera_config

    monitor = CameraSwitchMonitor(camera_configs)

    # Set up monitoring for each camera
    for camera_name, camera_config in camera_configs.items():
        monitor.setup_camera_monitoring(camera_name, camera_config)

    return monitor
