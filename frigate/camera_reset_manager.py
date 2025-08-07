"""
Global camera reset manager for coordinating camera resets across Frigate.

This module provides a centralized way to trigger camera resets without
using file-based signaling, instead using direct method calls and
proper thread-safe communication.
"""

import logging
import threading
import time
from typing import Callable, Dict, Optional

logger = logging.getLogger(__name__)


class CameraResetManager:
    """
    Global manager for coordinating camera resets.

    This singleton class manages camera reset callbacks and provides
    a clean interface for triggering resets from anywhere in Frigate.
    """

    _instance: Optional["CameraResetManager"] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return

        self._initialized = True
        self.camera_reset_callbacks: Dict[str, Callable[[str, str], None]] = {}
        self.last_reset_times: Dict[str, float] = {}
        self.reset_cooldown = 30.0  # seconds
        self._lock = threading.Lock()

    def register_camera_reset_callback(
        self, camera_name: str, callback: Callable[[str, str], None]
    ):
        """Register a callback function for camera reset for specific camera."""
        with self._lock:
            self.camera_reset_callbacks[camera_name] = callback
            logger.debug(f"Registered reset callback for camera {camera_name}")

    def unregister_camera_reset_callback(self, camera_name: str):
        """Unregister callback for a specific camera."""
        with self._lock:
            if camera_name in self.camera_reset_callbacks:
                del self.camera_reset_callbacks[camera_name]
                logger.debug(f"Unregistered reset callback for camera {camera_name}")

    def trigger_camera_reset(
        self, camera_name: str, reason: str = "Manual reset"
    ) -> bool:
        """
        Trigger a camera reset for the specified camera.

        Args:
            camera_name: Name of the camera to reset
            reason: Reason for the reset

        Returns:
            bool: True if reset was triggered, False if skipped due to cooldown or no callback
        """
        # Check if globally enabled
        from frigate.camera_switch_monitor import is_camera_switching_globally_enabled

        if not is_camera_switching_globally_enabled():
            logger.debug(
                f"Camera switching globally disabled, skipping reset for {camera_name}"
            )
            return False

        current_time = time.time()

        # Check cooldown
        with self._lock:
            if camera_name in self.last_reset_times:
                time_since_last = current_time - self.last_reset_times[camera_name]
                if time_since_last < self.reset_cooldown:
                    logger.info(
                        f"Skipping reset for {camera_name} - still in cooldown "
                        f"({time_since_last:.1f}s < {self.reset_cooldown}s)"
                    )
                    return False

            # Check if callback exists
            if camera_name not in self.camera_reset_callbacks:
                logger.warning(f"No reset callback registered for camera {camera_name}")
                return False

            # Get callback and update reset time
            callback = self.camera_reset_callbacks[camera_name]
            self.last_reset_times[camera_name] = current_time

        # Execute reset callback
        try:
            logger.info(f"Triggering camera reset for {camera_name}: {reason}")
            callback(camera_name, reason)
            return True
        except Exception as e:
            logger.error(
                f"Error executing camera reset callback for {camera_name}: {e}"
            )
            return False

    def get_camera_status(self, camera_name: str) -> Dict:
        """Get status information for a specific camera."""
        with self._lock:
            return {
                "has_callback": camera_name in self.camera_reset_callbacks,
                "last_reset": self.last_reset_times.get(camera_name),
                "cooldown_remaining": max(
                    0,
                    self.reset_cooldown
                    - (time.time() - self.last_reset_times.get(camera_name, 0)),
                )
                if camera_name in self.last_reset_times
                else 0,
            }

    def get_all_cameras_status(self) -> Dict:
        """Get status for all registered cameras."""
        with self._lock:
            return {
                camera_name: self.get_camera_status(camera_name)
                for camera_name in self.camera_reset_callbacks.keys()
            }

    def cleanup(self):
        """Clean up all callbacks and state."""
        with self._lock:
            self.camera_reset_callbacks.clear()
            self.last_reset_times.clear()
            logger.debug("Camera reset manager cleaned up")


# Global instance
camera_reset_manager = CameraResetManager()
