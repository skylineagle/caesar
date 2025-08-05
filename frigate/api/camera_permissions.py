import logging
from typing import List

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from frigate.api.auth import get_current_user
from frigate.models import CameraPermission, User

logger = logging.getLogger(__name__)


async def get_user_camera_permissions(username: str) -> List[str]:
    permissions = CameraPermission.select(CameraPermission.camera_name).where(
        CameraPermission.username == username
    )
    return [p.camera_name for p in permissions]


async def has_camera_permission(username: str, camera_name: str) -> bool:
    try:
        CameraPermission.get(
            (CameraPermission.username == username)
            & (CameraPermission.camera_name == camera_name)
        )
        return True
    except CameraPermission.DoesNotExist:
        return False


async def get_allowed_cameras_for_user(request: Request, username: str) -> List[str]:
    try:
        user = User.get_by_id(username)

        # Only the default admin user (username: admin, role: admin)
        # OR the development anonymous admin gets automatic access to all cameras
        is_default_admin = user.username == "admin" and user.role == "admin"
        is_dev_admin = user.username == "anonymous" and user.role == "admin"

        if is_default_admin or is_dev_admin:
            return list(request.app.frigate_config.cameras.keys())

        user_permissions = await get_user_camera_permissions(username)
        if not user_permissions:
            # No explicit permissions means user has access to all cameras (default)
            return list(request.app.frigate_config.cameras.keys())

        all_cameras = set(request.app.frigate_config.cameras.keys())
        allowed_cameras = set(user_permissions)
        return list(all_cameras.intersection(allowed_cameras))
    except User.DoesNotExist:
        return []


async def filter_cameras_by_permission(
    request: Request, cameras: List[str]
) -> List[str]:
    current_user = await get_current_user(request)
    if isinstance(current_user, JSONResponse):
        return []

    username = current_user.get("username", "")
    role = current_user.get("role", "viewer")

    if role == "admin":
        return cameras

    allowed_cameras = await get_allowed_cameras_for_user(request, username)
    return [camera for camera in cameras if camera in allowed_cameras]


async def require_camera_permission(request: Request, camera_name: str):
    current_user = await get_current_user(request)
    if isinstance(current_user, JSONResponse):
        raise HTTPException(status_code=401, detail="Authentication required")

    username = current_user.get("username", "")
    role = current_user.get("role", "viewer")

    if role == "admin":
        return True

    allowed_cameras = await get_allowed_cameras_for_user(request, username)

    if camera_name not in allowed_cameras:
        raise HTTPException(
            status_code=403, detail=f"Access denied to camera '{camera_name}'"
        )

    return True


async def grant_camera_permission(username: str, camera_name: str) -> bool:
    try:
        User.get_by_id(username)
    except User.DoesNotExist:
        return False

    try:
        CameraPermission.get(
            (CameraPermission.username == username)
            & (CameraPermission.camera_name == camera_name)
        )
        return True
    except CameraPermission.DoesNotExist:
        CameraPermission.create(username=username, camera_name=camera_name)
        return True


async def revoke_camera_permission(username: str, camera_name: str) -> bool:
    try:
        permission = CameraPermission.get(
            (CameraPermission.username == username)
            & (CameraPermission.camera_name == camera_name)
        )
        permission.delete_instance()
        return True
    except CameraPermission.DoesNotExist:
        return False


async def set_user_camera_permissions(username: str, camera_names: List[str]) -> bool:
    try:
        User.get_by_id(username)
    except User.DoesNotExist:
        return False

    CameraPermission.delete().where(CameraPermission.username == username).execute()

    for camera_name in camera_names:
        CameraPermission.create(username=username, camera_name=camera_name)

    return True


async def get_users_with_camera_permission(camera_name: str) -> List[dict]:
    permissions = CameraPermission.select(CameraPermission.username).where(
        CameraPermission.camera_name == camera_name
    )
    usernames = [p.username for p in permissions]

    if not usernames:
        all_users = User.select(User.username, User.role)
        return [{"username": user.username, "role": user.role} for user in all_users]

    users = User.select(User.username, User.role).where(User.username.in_(usernames))
    return [{"username": user.username, "role": user.role} for user in users]
