"""Recording management APIs."""

import logging

from dateutil import parser
from fastapi import APIRouter, Request
from fastapi.params import Depends
from fastapi.responses import JSONResponse

from frigate.api.auth import require_role
from frigate.api.defs.request.recordings_body import (
    RecordingsBackfillBody,
    RecordingsBackfillScheduleBody,
)
from frigate.api.defs.response.recordings_response import (
    RecordingsBackfillResponse,
    RecordingsBackfillScheduleResponse,
)
from frigate.api.defs.tags import Tags
from frigate.record.backfill import RecordingBackfillService

logger = logging.getLogger(__name__)


def parse_timestamp_flexible(value) -> float:
    """Parse timestamp, supporting both Unix timestamp and ISO format.

    Args:
        value: Timestamp value (float, int, or string)

    Returns:
        float: Unix timestamp

    Raises:
        ValueError: If timestamp format is invalid
    """
    if value is None:
        return None

    # If it's already a number, return as float
    if isinstance(value, (int, float)):
        return float(value)

    # If it's a string, try to parse it
    if isinstance(value, str):
        try:
            # Try to parse as float first
            return float(value)
        except ValueError:
            try:
                # Try to parse as ISO format
                dt = parser.isoparse(value)
                return dt.timestamp()
            except ValueError as e:
                raise ValueError(
                    f"Invalid timestamp format: {value}. Use Unix timestamp (e.g., 1693526400) or ISO format (e.g., 2023-09-01T00:00:00Z)"
                ) from e

    raise ValueError(
        f"Invalid timestamp type: {type(value)}. Expected number or string."
    )


router = APIRouter(tags=[Tags.recordings])


@router.post(
    "/recordings/{camera_name}/backfill",
    response_model=RecordingsBackfillResponse,
    dependencies=[Depends(require_role(["admin"]))],
)
def backfill_recordings(
    request: Request,
    camera_name: str,
    body: RecordingsBackfillBody,
):
    """Backfill missing recordings for a camera.

    This endpoint scans the recordings directory for files that exist on disk
    but are not in the database, and adds them to the database.
    """
    if not camera_name or not request.app.frigate_config.cameras.get(camera_name):
        return JSONResponse(
            content={
                "success": False,
                "message": f"Camera '{camera_name}' not found in configuration",
                "camera_name": camera_name,
                "total_files_scanned": 0,
                "files_added": 0,
                "files_skipped": 0,
                "files_errors": 0,
                "results": [],
                "processing_time_seconds": 0,
            },
            status_code=404,
        )

    try:
        backfill_service = RecordingBackfillService(request.app.frigate_config)

        result = backfill_service.backfill_recordings(
            camera_name=camera_name,
            directory_path=body.directory_path,
            start_time=body.start_time,  # Already validated and converted to float
            end_time=body.end_time,  # Already validated and converted to float
            date_filter=None,  # Auto-derived from timestamps if needed
            dry_run=body.dry_run,
            force=body.force,
        )

        return JSONResponse(
            content=result,
            status_code=200 if result["success"] else 400,
        )

    except Exception as e:
        logger.error(f"Error during backfill operation for camera {camera_name}: {e}")
        return JSONResponse(
            content={
                "success": False,
                "message": f"Internal server error during backfill operation: {str(e)}",
                "camera_name": camera_name,
                "total_files_scanned": 0,
                "files_added": 0,
                "files_skipped": 0,
                "files_errors": 0,
                "results": [],
                "processing_time_seconds": 0,
            },
            status_code=500,
        )


@router.post(
    "/recordings/{camera_name}/backfill/schedule",
    response_model=RecordingsBackfillScheduleResponse,
    dependencies=[Depends(require_role(["admin"]))],
)
def schedule_backfill_recordings(
    request: Request,
    camera_name: str,
    body: RecordingsBackfillScheduleBody,
):
    """Schedule automated backfill for a camera.

    This endpoint configures automated backfill operations for a camera.
    Note: This is a placeholder for future implementation of scheduled backfill.
    """
    if not camera_name or not request.app.frigate_config.cameras.get(camera_name):
        return JSONResponse(
            content={
                "success": False,
                "message": f"Camera '{camera_name}' not found in configuration",
                "camera_name": camera_name,
                "enabled": False,
                "interval_hours": 0,
                "retention_days": 0,
                "next_run": None,
            },
            status_code=404,
        )

    try:
        # TODO: Implement scheduled backfill functionality
        # This would involve storing the schedule configuration and
        # implementing a background task that runs periodically

        return JSONResponse(
            content={
                "success": True,
                "message": f"Backfill schedule configured for camera '{camera_name}' (not yet implemented)",
                "camera_name": camera_name,
                "enabled": body.enabled,
                "interval_hours": body.interval_hours,
                "retention_days": body.retention_days,
                "next_run": None,  # TODO: Calculate next run time
            },
            status_code=200,
        )

    except Exception as e:
        logger.error(
            f"Error configuring backfill schedule for camera {camera_name}: {e}"
        )
        return JSONResponse(
            content={
                "success": False,
                "message": f"Internal server error configuring backfill schedule: {str(e)}",
                "camera_name": camera_name,
                "enabled": False,
                "interval_hours": 0,
                "retention_days": 0,
                "next_run": None,
            },
            status_code=500,
        )


@router.get(
    "/recordings/{camera_name}/backfill/status",
    dependencies=[Depends(require_role(["admin"]))],
)
def get_backfill_status(
    request: Request,
    camera_name: str,
):
    """Get backfill status for a camera.

    This endpoint returns information about the backfill status for a camera.
    """
    if not camera_name or not request.app.frigate_config.cameras.get(camera_name):
        return JSONResponse(
            content={
                "success": False,
                "message": f"Camera '{camera_name}' not found in configuration",
            },
            status_code=404,
        )

    try:
        # TODO: Implement status checking functionality
        # This would check the current state of recordings vs database entries

        return JSONResponse(
            content={
                "success": True,
                "camera_name": camera_name,
                "last_backfill": None,  # TODO: Store and retrieve last backfill time
                "files_on_disk": 0,  # TODO: Count files on disk
                "files_in_database": 0,  # TODO: Count files in database
                "missing_files": 0,  # TODO: Calculate difference
                "scheduled_backfill_enabled": False,  # TODO: Check if scheduled backfill is enabled
            },
            status_code=200,
        )

    except Exception as e:
        logger.error(f"Error getting backfill status for camera {camera_name}: {e}")
        return JSONResponse(
            content={
                "success": False,
                "message": f"Internal server error getting backfill status: {str(e)}",
            },
            status_code=500,
        )
