import logging

from frigate.config import FrigateConfig
from frigate.models import CameraPermission, User

logger = logging.getLogger(__name__)


def initialize_default_permissions(config: FrigateConfig):
    all_cameras = list(config.cameras.keys())

    try:
        users = list(User.select())

        for user in users:
            if user.role == "admin":
                continue

            existing_permissions = list(
                CameraPermission.select().where(
                    CameraPermission.username == user.username
                )
            )

            if not existing_permissions:
                logger.info(
                    f"Setting default permissions for user {user.username} - granting access to all cameras"
                )
                for camera_name in all_cameras:
                    CameraPermission.create(
                        username=user.username, camera_name=camera_name
                    )

        logger.info("Default camera permissions initialization completed")

    except Exception as e:
        logger.error(f"Failed to initialize default camera permissions: {e}")


def cleanup_invalid_permissions(config: FrigateConfig):
    all_cameras = set(config.cameras.keys())

    try:
        invalid_permissions = CameraPermission.select().where(
            ~(CameraPermission.camera_name << list(all_cameras))
        )

        count = 0
        for permission in invalid_permissions:
            logger.warning(
                f"Removing invalid permission for camera {permission.camera_name} (camera no longer exists)"
            )
            permission.delete_instance()
            count += 1

        if count > 0:
            logger.info(f"Cleaned up {count} invalid camera permissions")

    except Exception as e:
        logger.error(f"Failed to cleanup invalid camera permissions: {e}")


def validate_camera_permissions_setup(config: FrigateConfig):
    initialize_default_permissions(config)
    cleanup_invalid_permissions(config)
    logger.info("Camera permissions system validated and ready")
