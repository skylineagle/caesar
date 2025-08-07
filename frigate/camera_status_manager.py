"""
Global camera status manager for coordinating status updates across Frigate.

This module provides a centralized way to store and retrieve camera status
without using file-based storage, instead using in-memory storage with
proper thread-safe access.
"""

import logging
import threading
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class CameraStatusManager:
    """
    Global manager for coordinating camera status updates.

    This singleton class manages camera status data and provides
    a clean interface for storing and retrieving status from anywhere in Frigate.
    """

    _instance: Optional["CameraStatusManager"] = None
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
        self.camera_status: Dict[str, Dict[str, Any]] = {}
        self.status_callbacks: Dict[str, callable] = {}
        self._lock = threading.Lock()

    def update_camera_status(self, camera_name: str, status_data: Dict[str, Any]):
        """Update status for a specific camera."""
        # Check if globally enabled
        from frigate.camera_switch_monitor import is_camera_switching_globally_enabled

        if not is_camera_switching_globally_enabled():
            return

        with self._lock:
            self.camera_status[camera_name] = {
                **status_data,
                "last_update": time.time(),
            }

            # Notify callback if registered
            if camera_name in self.status_callbacks:
                try:
                    self.status_callbacks[camera_name](camera_name, status_data)
                except Exception as e:
                    logger.debug(f"Error in status callback for {camera_name}: {e}")

    def get_camera_status(self, camera_name: str) -> Optional[Dict[str, Any]]:
        """Get status for a specific camera."""
        with self._lock:
            return self.camera_status.get(camera_name)

    def get_all_cameras_status(self) -> Dict[str, Dict[str, Any]]:
        """Get status for all cameras."""
        with self._lock:
            return self.camera_status.copy()

    def register_status_callback(self, camera_name: str, callback: callable):
        """Register a callback for status updates for a specific camera."""
        with self._lock:
            self.status_callbacks[camera_name] = callback
            logger.debug(f"Registered status callback for camera {camera_name}")

    def unregister_status_callback(self, camera_name: str):
        """Unregister callback for a specific camera."""
        with self._lock:
            if camera_name in self.status_callbacks:
                del self.status_callbacks[camera_name]
                logger.debug(f"Unregistered status callback for camera {camera_name}")

    def remove_camera_status(self, camera_name: str):
        """Remove status data for a specific camera."""
        with self._lock:
            if camera_name in self.camera_status:
                del self.camera_status[camera_name]
            if camera_name in self.status_callbacks:
                del self.status_callbacks[camera_name]

    def cleanup(self):
        """Clean up all status data and callbacks."""
        with self._lock:
            self.camera_status.clear()
            self.status_callbacks.clear()
            logger.debug("Camera status manager cleaned up")


# Global instance
camera_status_manager = CameraStatusManager()
