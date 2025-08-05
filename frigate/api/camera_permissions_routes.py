import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from frigate.api.auth import get_current_user, require_default_admin, require_role
from frigate.api.camera_permissions import (
    get_allowed_cameras_for_user,
    get_user_camera_permissions,
    get_users_with_camera_permission,
    grant_camera_permission,
    revoke_camera_permission,
    set_user_camera_permissions,
)
from frigate.models import CameraPermission, User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Camera Permissions"])


class SetCameraPermissionsBody(BaseModel):
    username: str
    camera_names: List[str]


class GrantCameraPermissionBody(BaseModel):
    username: str
    camera_name: str


class RevokeCameraPermissionBody(BaseModel):
    username: str
    camera_name: str


@router.get("/camera_permissions/users/{username}/cameras")
async def get_user_cameras(request: Request, username: str):
    current_user = await get_current_user(request)
    if isinstance(current_user, JSONResponse):
        raise HTTPException(status_code=401, detail="Authentication required")

    current_username = current_user.get("username", "")
    current_role = current_user.get("role", "viewer")

    if current_role != "admin" and current_username != username:
        raise HTTPException(
            status_code=403, detail="You can only view your own camera permissions"
        )

    try:
        User.get_by_id(username)
    except User.DoesNotExist:
        raise HTTPException(status_code=404, detail="User not found")

    allowed_cameras = await get_allowed_cameras_for_user(request, username)
    return JSONResponse(content={"cameras": allowed_cameras})


@router.get("/camera_permissions/cameras/{camera_name}/users")
async def get_camera_users(
    camera_name: str, dependencies=[Depends(require_role(["admin"]))]
):
    if not camera_name:
        raise HTTPException(status_code=400, detail="Camera name is required")

    users = await get_users_with_camera_permission(camera_name)
    return JSONResponse(content={"users": users})


@router.post(
    "/camera_permissions/grant", dependencies=[Depends(require_default_admin())]
)
async def grant_permission(body: GrantCameraPermissionBody):
    success = await grant_camera_permission(body.username, body.camera_name)

    if not success:
        raise HTTPException(status_code=404, detail="User not found")

    return JSONResponse(content={"success": True})


@router.post(
    "/camera_permissions/revoke", dependencies=[Depends(require_default_admin())]
)
async def revoke_permission(request: Request, body: RevokeCameraPermissionBody):
    try:
        User.get_by_id(body.username)
    except User.DoesNotExist:
        return JSONResponse(content={"success": False, "message": "User not found"})

    # Check if user has explicit permissions in the database
    permissions_exist = (
        CameraPermission.select()
        .where(CameraPermission.username == body.username)
        .exists()
    )

    if not permissions_exist:
        # User has default access to all cameras
        # Create explicit permissions for all cameras except the one being revoked
        all_cameras = list(request.app.frigate_config.cameras.keys())
        remaining_cameras = [cam for cam in all_cameras if cam != body.camera_name]
        success = await set_user_camera_permissions(body.username, remaining_cameras)

        if not success:
            return JSONResponse(
                content={"success": False, "message": "Failed to update permissions"}
            )
    else:
        # User has explicit permissions, try to revoke the specific one
        success = await revoke_camera_permission(body.username, body.camera_name)

        if not success:
            return JSONResponse(
                content={"success": False, "message": "Permission not found"}
            )

    return JSONResponse(content={"success": True})


@router.post("/camera_permissions/set", dependencies=[Depends(require_default_admin())])
async def set_permissions(body: SetCameraPermissionsBody):
    success = await set_user_camera_permissions(body.username, body.camera_names)

    if not success:
        raise HTTPException(status_code=404, detail="User not found")

    return JSONResponse(content={"success": True})


@router.get(
    "/camera_permissions/summary", dependencies=[Depends(require_default_admin())]
)
async def get_permissions_summary():
    users = User.select(User.username, User.role)
    result = []

    for user in users:
        # Only the default admin user or dev anonymous admin gets automatic "all" cameras access
        is_default_admin = user.username == "admin" and user.role == "admin"
        is_dev_admin = user.username == "anonymous" and user.role == "admin"

        if is_default_admin or is_dev_admin:
            result.append(
                {"username": user.username, "role": user.role, "cameras": "all"}
            )
        else:
            permissions = await get_user_camera_permissions(user.username)
            result.append(
                {
                    "username": user.username,
                    "role": user.role,
                    "cameras": permissions if permissions else "all",
                }
            )

    return JSONResponse(content={"permissions": result})
