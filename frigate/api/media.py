"""Image and video apis."""

import asyncio
import glob
import logging
import math
import os
import subprocess as sp
import time
from datetime import datetime, timedelta, timezone
from functools import reduce
from pathlib import Path as FilePath
from typing import Any
from urllib.parse import unquote

import cv2
import numpy as np
import pytz
from dateutil import parser
from fastapi import APIRouter, Path, Query, Request, Response
from fastapi.params import Depends
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pathvalidate import sanitize_filename
from peewee import DoesNotExist, fn, operator
from tzlocal import get_localzone_name

from frigate.api.camera_permissions import require_camera_permission
from frigate.api.defs.query.media_query_parameters import (
    Extension,
    MediaEventsSnapshotQueryParams,
    MediaLatestFrameQueryParams,
    MediaMjpegFeedQueryParams,
    MediaRecordingsAvailabilityQueryParams,
    MediaRecordingsSummaryQueryParams,
)
from frigate.api.defs.tags import Tags
from frigate.camera.state import CameraState
from frigate.config import FrigateConfig
from frigate.const import (
    CACHE_DIR,
    CLIPS_DIR,
    INSTALL_DIR,
    MAX_SEGMENT_DURATION,
    PREVIEW_FRAME_TYPE,
    RECORD_DIR,
)
from frigate.models import Event, Previews, Recordings, Regions, ReviewSegment
from frigate.track.object_processing import TrackedObjectProcessor
from frigate.util.builtin import get_tz_modifiers
from frigate.util.image import get_image_from_recording
from frigate.util.path import get_event_thumbnail_bytes

logger = logging.getLogger(__name__)


def parse_timestamp(timestamp_str: str) -> float:
    """Parse timestamp string, supporting both Unix timestamp and ISO format.

    Args:
        timestamp_str: String timestamp (Unix timestamp or ISO format)

    Returns:
        float: Unix timestamp

    Raises:
        ValueError: If timestamp format is invalid
    """
    if not timestamp_str:
        return datetime.now().timestamp()

    try:
        # Try to parse as float (Unix timestamp)
        return float(timestamp_str)
    except ValueError:
        try:
            # Try to parse as ISO format
            dt = parser.isoparse(timestamp_str)
            return dt.timestamp()
        except ValueError as e:
            raise ValueError(
                f"Invalid timestamp format: {timestamp_str}. Use Unix timestamp (e.g., 1693526400) or ISO format (e.g., 2023-09-01T00:00:00Z)"
            ) from e


router = APIRouter(tags=[Tags.media])


@router.get("/debug/files/{camera_name}")
def debug_files(camera_name: str):
    """Debug endpoint to check file availability for a camera."""
    import os

    from frigate.models import Recordings

    # Get all recordings for this camera
    recordings = list(
        Recordings.select().where(Recordings.camera == camera_name).limit(10)
    )

    results = []
    for recording in recordings:
        file_exists = os.path.exists(recording.path)
        file_size = os.path.getsize(recording.path) if file_exists else 0
        is_backfill = (
            recording.motion == -1 and recording.objects == -1 and recording.dBFS == -1
        )

        results.append(
            {
                "id": recording.id,
                "path": recording.path,
                "exists": file_exists,
                "size": file_size,
                "backfill": is_backfill,
                "start_time": recording.start_time,
                "end_time": recording.end_time,
                "duration": recording.duration,
            }
        )

    return JSONResponse(content={"camera": camera_name, "recordings": results})


@router.get("/{camera_name}")
async def mjpeg_feed(
    request: Request,
    camera_name: str,
    params: MediaMjpegFeedQueryParams = Depends(),
):
    draw_options = {
        "bounding_boxes": params.bbox,
        "timestamp": params.timestamp,
        "zones": params.zones,
        "mask": params.mask,
        "motion_boxes": params.motion,
        "regions": params.regions,
    }
    if camera_name not in request.app.frigate_config.cameras:
        return JSONResponse(
            content={"success": False, "message": "Camera not found"},
            status_code=404,
        )

    # Check camera permission
    await require_camera_permission(request, camera_name)

    # return a multipart response
    return StreamingResponse(
        imagestream(
            request.app.detected_frames_processor,
            camera_name,
            params.fps,
            params.height,
            draw_options,
        ),
        media_type="multipart/x-mixed-replace;boundary=frame",
    )


def imagestream(
    detected_frames_processor: TrackedObjectProcessor,
    camera_name: str,
    fps: int,
    height: int,
    draw_options: dict[str, Any],
):
    while True:
        # max out at specified FPS
        time.sleep(1 / fps)
        frame = detected_frames_processor.get_current_frame(camera_name, draw_options)
        if frame is None:
            frame = np.zeros((height, int(height * 16 / 9), 3), np.uint8)

        width = int(height * frame.shape[1] / frame.shape[0])
        frame = cv2.resize(frame, dsize=(width, height), interpolation=cv2.INTER_LINEAR)

        ret, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + bytearray(jpg.tobytes()) + b"\r\n\r\n"
        )


@router.get("/{camera_name}/ptz/info")
async def camera_ptz_info(request: Request, camera_name: str):
    if camera_name in request.app.frigate_config.cameras:
        # Schedule get_camera_info in the OnvifController's event loop
        future = asyncio.run_coroutine_threadsafe(
            request.app.onvif.get_camera_info(camera_name), request.app.onvif.loop
        )
        result = future.result()
        return JSONResponse(content=result)
    else:
        return JSONResponse(
            content={"success": False, "message": "Camera not found"},
            status_code=404,
        )


@router.get("/{camera_name}/latest.{extension}")
def latest_frame(
    request: Request,
    camera_name: str,
    extension: Extension,
    params: MediaLatestFrameQueryParams = Depends(),
):
    frame_processor: TrackedObjectProcessor = request.app.detected_frames_processor
    draw_options = {
        "bounding_boxes": params.bbox,
        "timestamp": params.timestamp,
        "zones": params.zones,
        "mask": params.mask,
        "motion_boxes": params.motion,
        "paths": params.paths,
        "regions": params.regions,
    }
    quality = params.quality
    mime_type = extension

    if extension == "png":
        quality_params = None
    elif extension == "webp":
        quality_params = [int(cv2.IMWRITE_WEBP_QUALITY), quality]
    else:
        quality_params = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
        mime_type = "jpeg"

    if camera_name in request.app.frigate_config.cameras:
        frame = frame_processor.get_current_frame(camera_name, draw_options)
        retry_interval = float(
            request.app.frigate_config.cameras.get(camera_name).ffmpeg.retry_interval
            or 10
        )

        if frame is None or datetime.now().timestamp() > (
            frame_processor.get_current_frame_time(camera_name) + retry_interval
        ):
            if request.app.camera_error_image is None:
                error_image = glob.glob(
                    os.path.join(INSTALL_DIR, "frigate/images/camera-error.jpg")
                )

                if len(error_image) > 0:
                    request.app.camera_error_image = cv2.imread(
                        error_image[0], cv2.IMREAD_UNCHANGED
                    )

            frame = request.app.camera_error_image

        height = int(params.height or str(frame.shape[0]))
        width = int(height * frame.shape[1] / frame.shape[0])

        if frame is None:
            return JSONResponse(
                content={"success": False, "message": "Unable to get valid frame"},
                status_code=500,
            )

        if height < 1 or width < 1:
            return JSONResponse(
                content="Invalid height / width requested :: {} / {}".format(
                    height, width
                ),
                status_code=400,
            )

        frame = cv2.resize(frame, dsize=(width, height), interpolation=cv2.INTER_AREA)

        _, img = cv2.imencode(f".{extension}", frame, quality_params)
        return Response(
            content=img.tobytes(),
            media_type=f"image/{mime_type}",
            headers={
                "Content-Type": f"image/{mime_type}",
                "Cache-Control": "no-store"
                if not params.store
                else "private, max-age=60",
            },
        )
    elif camera_name == "birdseye" and request.app.frigate_config.birdseye.restream:
        frame = cv2.cvtColor(
            frame_processor.get_current_frame(camera_name),
            cv2.COLOR_YUV2BGR_I420,
        )

        height = int(params.height or str(frame.shape[0]))
        width = int(height * frame.shape[1] / frame.shape[0])

        frame = cv2.resize(frame, dsize=(width, height), interpolation=cv2.INTER_AREA)

        _, img = cv2.imencode(f".{extension}", frame, quality_params)
        return Response(
            content=img.tobytes(),
            media_type=f"image/{mime_type}",
            headers={
                "Content-Type": f"image/{mime_type}",
                "Cache-Control": "no-store"
                if not params.store
                else "private, max-age=60",
            },
        )
    else:
        return JSONResponse(
            content={"success": False, "message": "Camera not found"},
            status_code=404,
        )


@router.get("/{camera_name}/recordings/{frame_time}/snapshot.{format}")
def get_snapshot_from_recording(
    request: Request,
    camera_name: str,
    frame_time: float,
    format: str = Path(enum=["png", "jpg"]),
    height: int = None,
):
    if camera_name not in request.app.frigate_config.cameras:
        return JSONResponse(
            content={"success": False, "message": "Camera not found"},
            status_code=404,
        )
    recording: Recordings | None = None

    try:
        recording = (
            Recordings.select(
                Recordings.path,
                Recordings.start_time,
            )
            .where(
                (
                    (frame_time >= Recordings.start_time)
                    & (frame_time <= Recordings.end_time)
                )
            )
            .where(Recordings.camera == camera_name)
            .order_by(Recordings.start_time.desc())
            .limit(1)
            .get()
        )
    except DoesNotExist:
        # try again with a rounded frame time as it may be between
        # the rounded segment start time
        frame_time = math.ceil(frame_time)
        try:
            recording = (
                Recordings.select(
                    Recordings.path,
                    Recordings.start_time,
                )
                .where(
                    (
                        (frame_time >= Recordings.start_time)
                        & (frame_time <= Recordings.end_time)
                    )
                )
                .where(Recordings.camera == camera_name)
                .order_by(Recordings.start_time.desc())
                .limit(1)
                .get()
            )
        except DoesNotExist:
            pass

    if recording is not None:
        time_in_segment = frame_time - recording.start_time
        codec = "png" if format == "png" else "mjpeg"
        mime_type = "png" if format == "png" else "jpeg"
        config: FrigateConfig = request.app.frigate_config

        image_data = get_image_from_recording(
            config.ffmpeg, recording.path, time_in_segment, codec, height
        )

        if not image_data:
            return JSONResponse(
                content=(
                    {
                        "success": False,
                        "message": f"Unable to parse frame at time {frame_time}",
                    }
                ),
                status_code=404,
            )
        return Response(image_data, headers={"Content-Type": f"image/{mime_type}"})
    else:
        return JSONResponse(
            content={
                "success": False,
                "message": "Recording not found at {}".format(frame_time),
            },
            status_code=404,
        )


@router.post("/{camera_name}/plus/{frame_time}")
def submit_recording_snapshot_to_plus(
    request: Request, camera_name: str, frame_time: str
):
    if camera_name not in request.app.frigate_config.cameras:
        return JSONResponse(
            content={"success": False, "message": "Camera not found"},
            status_code=404,
        )

    frame_time = float(frame_time)
    recording_query = (
        Recordings.select(
            Recordings.path,
            Recordings.start_time,
        )
        .where(
            (
                (frame_time >= Recordings.start_time)
                & (frame_time <= Recordings.end_time)
            )
        )
        .where(Recordings.camera == camera_name)
        .order_by(Recordings.start_time.desc())
        .limit(1)
    )

    try:
        config: FrigateConfig = request.app.frigate_config
        recording: Recordings = recording_query.get()
        time_in_segment = frame_time - recording.start_time
        image_data = get_image_from_recording(
            config.ffmpeg, recording.path, time_in_segment, "png"
        )

        if not image_data:
            return JSONResponse(
                content={
                    "success": False,
                    "message": f"Unable to parse frame at time {frame_time}",
                },
                status_code=404,
            )

        nd = cv2.imdecode(np.frombuffer(image_data, dtype=np.int8), cv2.IMREAD_COLOR)
        request.app.frigate_config.plus_api.upload_image(nd, camera_name)

        return JSONResponse(
            content={
                "success": True,
                "message": "Successfully submitted image.",
            },
            status_code=200,
        )
    except DoesNotExist:
        return JSONResponse(
            content={
                "success": False,
                "message": "Recording not found at {}".format(frame_time),
            },
            status_code=404,
        )


@router.get("/recordings/storage")
def get_recordings_storage_usage(request: Request):
    recording_stats = request.app.stats_emitter.get_latest_stats()["service"][
        "storage"
    ][RECORD_DIR]

    if not recording_stats:
        return JSONResponse({})

    total_mb = recording_stats["total"]

    camera_usages: dict[str, dict] = (
        request.app.storage_maintainer.calculate_camera_usages()
    )

    for camera_name in camera_usages.keys():
        if camera_usages.get(camera_name, {}).get("usage"):
            camera_usages[camera_name]["usage_percent"] = (
                camera_usages.get(camera_name, {}).get("usage", 0) / total_mb
            ) * 100

    return JSONResponse(content=camera_usages)


@router.get("/recordings/summary")
def all_recordings_summary(params: MediaRecordingsSummaryQueryParams = Depends()):
    """Returns true/false by day indicating if recordings exist"""
    hour_modifier, minute_modifier, seconds_offset = get_tz_modifiers(params.timezone)

    cameras = params.cameras

    query = (
        Recordings.select(
            fn.strftime(
                "%Y-%m-%d",
                fn.datetime(
                    Recordings.start_time + seconds_offset,
                    "unixepoch",
                    hour_modifier,
                    minute_modifier,
                ),
            ).alias("day")
        )
        .group_by(
            fn.strftime(
                "%Y-%m-%d",
                fn.datetime(
                    Recordings.start_time + seconds_offset,
                    "unixepoch",
                    hour_modifier,
                    minute_modifier,
                ),
            )
        )
        .order_by(Recordings.start_time.desc())
    )

    if cameras != "all":
        query = query.where(Recordings.camera << cameras.split(","))

    recording_days = query.namedtuples()
    days = {day.day: True for day in recording_days}

    return JSONResponse(content=days)


@router.get("/{camera_name}/recordings/summary")
def recordings_summary(camera_name: str, timezone: str = "utc"):
    """Returns hourly summary for recordings of given camera"""
    hour_modifier, minute_modifier, seconds_offset = get_tz_modifiers(timezone)
    recording_groups = (
        Recordings.select(
            fn.strftime(
                "%Y-%m-%d %H",
                fn.datetime(
                    Recordings.start_time, "unixepoch", hour_modifier, minute_modifier
                ),
            ).alias("hour"),
            fn.SUM(Recordings.duration).alias("duration"),
            fn.SUM(Recordings.motion).alias("motion"),
            fn.SUM(Recordings.objects).alias("objects"),
        )
        .where(Recordings.camera == camera_name)
        .group_by((Recordings.start_time + seconds_offset).cast("int") / 3600)
        .order_by(Recordings.start_time.desc())
        .namedtuples()
    )

    event_groups = (
        Event.select(
            fn.strftime(
                "%Y-%m-%d %H",
                fn.datetime(
                    Event.start_time, "unixepoch", hour_modifier, minute_modifier
                ),
            ).alias("hour"),
            fn.COUNT(Event.id).alias("count"),
        )
        .where(Event.camera == camera_name, Event.has_clip)
        .group_by((Event.start_time + seconds_offset).cast("int") / 3600)
        .namedtuples()
    )

    event_map = {g.hour: g.count for g in event_groups}

    days = {}

    for recording_group in recording_groups:
        parts = recording_group.hour.split()
        hour = parts[1]
        day = parts[0]
        events_count = event_map.get(recording_group.hour, 0)
        hour_data = {
            "hour": hour,
            "events": events_count,
            "motion": recording_group.motion,
            "objects": recording_group.objects,
            "duration": round(recording_group.duration),
        }
        if day not in days:
            days[day] = {"events": events_count, "hours": [hour_data], "day": day}
        else:
            days[day]["events"] += events_count
            days[day]["hours"].append(hour_data)

    return JSONResponse(content=list(days.values()))


@router.get("/{camera_name}/recordings")
def recordings(
    camera_name: str,
    after: str = Query(
        default=None,
        description="Start time - Unix timestamp (e.g., 1693526400) or ISO format (e.g., 2023-09-01T00:00:00Z)",
    ),
    before: str = Query(
        default=None,
        description="End time - Unix timestamp (e.g., 1693526400) or ISO format (e.g., 2023-09-01T00:00:00Z)",
    ),
):
    """Return specific camera recordings between the given 'after'/'end' times. If not provided the last hour will be used"""

    # Parse timestamps (support both Unix timestamp and ISO format)
    try:
        after_ts = (
            parse_timestamp(after)
            if after
            else (datetime.now() - timedelta(hours=1)).timestamp()
        )
        before_ts = parse_timestamp(before) if before else datetime.now().timestamp()
    except ValueError as e:
        return JSONResponse(
            content={"success": False, "message": str(e)}, status_code=400
        )

    recordings = (
        Recordings.select(
            Recordings.id,
            Recordings.start_time,
            Recordings.end_time,
            Recordings.segment_size,
            Recordings.motion,
            Recordings.objects,
            Recordings.dBFS,
            Recordings.duration,
        )
        .where(
            Recordings.camera == camera_name,
            Recordings.end_time >= after_ts,
            Recordings.start_time <= before_ts,
        )
        .order_by(Recordings.start_time)
        .dicts()
        .iterator()
    )

    # Convert to list and add minimal debugging
    recordings_list = list(recordings)

    # Count backfill recordings for logging
    backfill_count = sum(
        1
        for r in recordings_list
        if r["motion"] == -1 or r["objects"] == -1 or r["dBFS"] == -1
    )

    if backfill_count > 0:
        logger.info(
            f"🔍 API returning {backfill_count} backfill recordings for {camera_name}"
        )

    return JSONResponse(content=recordings_list)


@router.get("/recordings/unavailable", response_model=list[dict])
def no_recordings(params: MediaRecordingsAvailabilityQueryParams = Depends()):
    """Get time ranges with no recordings."""
    cameras = params.cameras
    before = params.before or datetime.datetime.now().timestamp()
    after = (
        params.after
        or (datetime.datetime.now() - datetime.timedelta(hours=1)).timestamp()
    )
    scale = params.scale

    clauses = [(Recordings.start_time > after) & (Recordings.end_time < before)]
    if cameras != "all":
        camera_list = cameras.split(",")
        clauses.append((Recordings.camera << camera_list))

    # Get recording start times
    data: list[Recordings] = (
        Recordings.select(Recordings.start_time, Recordings.end_time)
        .where(reduce(operator.and_, clauses))
        .order_by(Recordings.start_time.asc())
        .dicts()
        .iterator()
    )

    # Convert recordings to list of (start, end) tuples
    recordings = [(r["start_time"], r["end_time"]) for r in data]

    # Generate all time segments
    current = after
    no_recording_segments = []
    current_start = None

    while current < before:
        segment_end = current + scale
        # Check if segment overlaps with any recording
        has_recording = any(
            start <= segment_end and end >= current for start, end in recordings
        )
        if not has_recording:
            if current_start is None:
                current_start = current  # Start a new gap
        else:
            if current_start is not None:
                # End the current gap and append it
                no_recording_segments.append(
                    {"start_time": int(current_start), "end_time": int(current)}
                )
                current_start = None
        current = segment_end

    # Append the last gap if it exists
    if current_start is not None:
        no_recording_segments.append(
            {"start_time": int(current_start), "end_time": int(before)}
        )

    return JSONResponse(content=no_recording_segments)


@router.get(
    "/{camera_name}/start/{start_ts}/end/{end_ts}/clip.mp4",
    description="For iOS devices, use the master.m3u8 HLS link instead of clip.mp4. Safari does not reliably process progressive mp4 files.",
)
def recording_clip(
    request: Request,
    camera_name: str,
    start_ts: float,
    end_ts: float,
):
    def run_download(ffmpeg_cmd: list[str], file_path: str):
        with sp.Popen(
            ffmpeg_cmd,
            stderr=sp.PIPE,
            stdout=sp.PIPE,
            text=False,
        ) as ffmpeg:
            while True:
                data = ffmpeg.stdout.read(8192)
                if data is not None and len(data) > 0:
                    yield data
                else:
                    if ffmpeg.returncode and ffmpeg.returncode != 0:
                        logger.error(
                            f"Failed to generate clip, ffmpeg logs: {ffmpeg.stderr.read()}"
                        )
                    else:
                        FilePath(file_path).unlink(missing_ok=True)
                    break

    recordings = (
        Recordings.select(
            Recordings.path,
            Recordings.start_time,
            Recordings.end_time,
        )
        .where(
            (Recordings.start_time.between(start_ts, end_ts))
            | (Recordings.end_time.between(start_ts, end_ts))
            | ((start_ts > Recordings.start_time) & (end_ts < Recordings.end_time))
        )
        .where(Recordings.camera == camera_name)
        .order_by(Recordings.start_time.asc())
    )

    file_name = sanitize_filename(f"playlist_{camera_name}_{start_ts}-{end_ts}.txt")
    file_path = os.path.join(CACHE_DIR, file_name)
    with open(file_path, "w") as file:
        clip: Recordings
        for clip in recordings:
            file.write(f"file '{clip.path}'\n")

            # if this is the starting clip, add an inpoint
            if clip.start_time < start_ts:
                file.write(f"inpoint {int(start_ts - clip.start_time)}\n")

            # if this is the ending clip, add an outpoint
            if clip.end_time > end_ts:
                file.write(f"outpoint {int(end_ts - clip.start_time)}\n")

    if len(file_name) > 1000:
        return JSONResponse(
            content={
                "success": False,
                "message": "Filename exceeded max length of 1000",
            },
            status_code=403,
        )

    config: FrigateConfig = request.app.frigate_config

    ffmpeg_cmd = [
        config.ffmpeg.ffmpeg_path,
        "-hide_banner",
        "-y",
        "-protocol_whitelist",
        "pipe,file",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        file_path,
        "-c",
        "copy",
        "-movflags",
        "frag_keyframe+empty_moov",
        "-f",
        "mp4",
        "pipe:",
    ]

    return StreamingResponse(
        run_download(ffmpeg_cmd, file_path),
        media_type="video/mp4",
    )


@router.get(
    "/vod/{camera_name}/start/{start_ts}/end/{end_ts}",
    description="Returns an HLS playlist for the specified timestamp-range on the specified camera. Append /master.m3u8 or /index.m3u8 for HLS playback.",
)
def vod_ts(camera_name: str, start_ts: float, end_ts: float):
    logger.info(
        f"🚀 VOD ENDPOINT CALLED: camera={camera_name} start={start_ts} end={end_ts}"
    )
    logger.info(
        f"🔍 VOD REQUEST STARTED: camera={camera_name} start={start_ts} end={end_ts}"
    )

    # If start and end timestamps are the same, expand the range slightly
    # This handles cases where the frontend sends identical timestamps
    if start_ts == end_ts:
        # Expand by 10 seconds on each side to capture nearby recordings
        start_ts = start_ts - 10
        end_ts = end_ts + 10
        logger.info(f"🔧 Expanded time range to: {start_ts} to {end_ts}")
    else:
        logger.info(f"✅ Time range OK: {start_ts} to {end_ts}")

    # Build the query with detailed logging
    query = Recordings.select(
        Recordings.path,
        Recordings.duration,
        Recordings.end_time,
        Recordings.start_time,
        Recordings.motion,
        Recordings.objects,
        Recordings.dBFS,
    ).where(Recordings.camera == camera_name)

    # Add time range conditions
    time_condition = (
        Recordings.start_time.between(start_ts, end_ts)
        | Recordings.end_time.between(start_ts, end_ts)
        | ((start_ts > Recordings.start_time) & (end_ts < Recordings.end_time))
    )
    query = query.where(time_condition)

    logger.info(f"🔍 VOD SQL query: {query}")
    logger.info(f"🔍 VOD time condition: start_ts={start_ts}, end_ts={end_ts}")

    recordings = query.order_by(Recordings.start_time.asc()).iterator()

    clips = []
    durations = []
    max_duration_ms = MAX_SEGMENT_DURATION * 1000

    # Convert to list for debugging
    recordings_list = list(recordings)
    logger.info(
        f"📊 VOD found {len(recordings_list)} recordings - starting detailed processing"
    )

    if len(recordings_list) == 0:
        logger.error(f"❌ NO RECORDINGS FOUND IN RANGE: {start_ts} to {end_ts}")
        logger.error("❌ This means no recordings exist for the time you clicked on!")
        logger.error(
            "❌ Try clicking on a time where you can see segments in the timeline"
        )

    for recording in recordings_list:
        is_backfill = (
            recording.motion == -1 or recording.objects == -1 or recording.dBFS == -1
        )
        logger.info(
            f"📹 Recording: {recording.path} (start={recording.start_time}, end={recording.end_time}, backfill={is_backfill})"
        )

    # Also check if there are ANY recordings for this camera in a wider time range
    all_recordings = Recordings.select().where(Recordings.camera == camera_name).count()
    logger.info(f"📊 Total recordings for camera {camera_name}: {all_recordings}")

    # Check recordings in a wider time window around the requested range
    wide_start = start_ts - 3600  # 1 hour before
    wide_end = end_ts + 3600  # 1 hour after
    wide_recordings = list(
        Recordings.select(
            Recordings.start_time,
            Recordings.end_time,
            Recordings.motion,
            Recordings.objects,
            Recordings.dBFS,
        )
        .where(Recordings.camera == camera_name)
        .where(Recordings.start_time.between(wide_start, wide_end))
        .order_by(Recordings.start_time.asc())
    )
    logger.info(
        f"📊 Recordings in wider range ({wide_start} to {wide_end}): {len(wide_recordings)}"
    )
    for rec in wide_recordings:
        logger.info(
            f"   📹 Wide range: start={rec.start_time}, end={rec.end_time}, motion={rec.motion}, objects={rec.objects}, dBFS={rec.dBFS}"
        )

    recording: Recordings
    for recording in recordings_list:
        # Check if the recording file actually exists on disk
        import os

        file_exists = os.path.exists(recording.path)
        file_size = os.path.getsize(recording.path) if file_exists else 0

        # CRITICAL: For backfill recordings, ensure file is accessible and readable
        file_readable = False
        if file_exists:
            try:
                with open(recording.path, "rb") as f:
                    f.read(1024)  # Try to read first 1KB
                file_readable = True
            except (IOError, OSError) as e:
                logger.error(f"❌ Cannot read file {recording.path}: {e}")

        # Basic file validation - check if file exists and has reasonable size
        is_valid_mp4 = (
            file_exists
            and file_size > 1000
            and recording.path.lower().endswith(".mp4")
            and file_readable
        )
        logger.info(
            f"📁 File validation: {recording.path} exists={file_exists} readable={file_readable} size={file_size} bytes valid_mp4={is_valid_mp4}"
        )

        # If file is not readable, skip this recording entirely
        if not is_valid_mp4:
            logger.warning(f"⚠️ Skipping unreadable recording: {recording.path}")
            continue

        logger.info(
            f"📁 File check: {recording.path} exists={file_exists} size={file_size} bytes valid_mp4={is_valid_mp4}"
        )

        # Check if this is a backfill recording
        is_backfill_recording = (
            recording.motion == -1 and recording.objects == -1 and recording.dBFS == -1
        )

        clip = {"type": "source", "path": recording.path}
        if is_backfill_recording:
            # Mark backfill recordings for special handling
            clip["backfill"] = True
            logger.info(f"🏷️ Marked backfill recording: {recording.path}")

        original_duration = recording.duration
        duration = int(recording.duration * 1000)

        logger.info(
            f"⏱️ Recording duration: {recording.path} original={original_duration}s calculated={duration}ms"
        )

        # For debugging: check if the file path is accessible
        import os

        file_exists = os.path.exists(recording.path)
        if not file_exists:
            logger.error(
                f"❌ CRITICAL: Recording file does not exist: {recording.path}"
            )
            # Try to find the file in different locations
            alternative_paths = [
                recording.path.replace("/media/frigate/recordings/", "/media/frigate/"),
                recording.path.replace("/media/frigate/", "/"),
                f"/media/frigate{recording.path}"
                if not recording.path.startswith("/media/frigate")
                else recording.path,
            ]
            for alt_path in alternative_paths:
                if os.path.exists(alt_path):
                    logger.info(f"✅ Found file at alternative path: {alt_path}")
                    clip["path"] = alt_path
                    break
        else:
            logger.info(f"✅ File exists: {recording.path}")

        # For backfill recordings, don't apply time-based clipping as they fill specific gaps
        if not is_backfill_recording:
            # adjust start offset if start_ts is after recording.start_time
            if start_ts > recording.start_time:
                inpoint = int((start_ts - recording.start_time) * 1000)
                clip["clipFrom"] = inpoint
                duration -= inpoint
                logger.info(
                    f"✂️ Applied inpoint offset: {inpoint}ms, new duration={duration}ms"
                )

            # adjust end if recording.end_time is after end_ts
            if recording.end_time > end_ts:
                outpoint_offset = int((recording.end_time - end_ts) * 1000)
                duration -= outpoint_offset
                logger.info(
                    f"✂️ Applied outpoint offset: {outpoint_offset}ms, new duration={duration}ms"
                )
        else:
            logger.info(
                f"🏷️ Backfill recording - skipping time-based clipping for: {recording.path}"
            )

        if duration <= 0:
            # skip if the clip has no valid duration
            continue

        if 0 < duration < max_duration_ms:
            clip["keyFrameDurations"] = [duration]
            clips.append(clip)
            durations.append(duration)
            logger.info(f"✅ Added clip: {recording.path} (duration={duration}ms)")
        else:
            logger.warning(
                f"❌ Recording clip invalid: {recording.path} (duration={duration}ms, max={max_duration_ms}ms)"
            )

    if not clips:
        error_msg = (
            f"No recordings found for {camera_name} during the requested time range"
        )
        if len(recordings_list) == 0:
            error_msg += (
                " (no recordings exist for this time period - try a different time)"
            )
        logger.error(error_msg)
        return JSONResponse(
            content={
                "success": False,
                "message": "No recordings found for this time period. Try clicking on a different time where you can see segments in the timeline.",
            },
            status_code=404,
        )

    # Ensure clips are properly formatted for nginx-vod-module
    # nginx-vod-module expects absolute paths and will handle them correctly
    processed_clips = []
    for clip in clips:
        processed_clip = {
            "type": clip.get("type", "source"),
            "path": clip.get("path", ""),
        }

        # Add optional fields if they exist
        if "clipFrom" in clip:
            processed_clip["clipFrom"] = clip["clipFrom"]

        processed_clips.append(processed_clip)

    logger.info(
        f"🎬 VOD Response: Found {len(processed_clips)} clips, durations={durations}"
    )
    for i, clip in enumerate(processed_clips):
        logger.info(f"   📹 Clip {i}: {clip}")

    hour_ago = datetime.now() - timedelta(hours=1)
    response_data = {
        "cache": hour_ago.timestamp() > start_ts,
        "discontinuity": False,
        "consistentSequenceMediaInfo": True,
        "durations": durations,
        "segment_duration": max(durations) if durations else 0,
        "sequences": [{"clips": processed_clips}],
    }

    logger.info(
        f"📤 Sending VOD response with {len(processed_clips)} clips for nginx-vod-module"
    )
    return JSONResponse(content=response_data)


@router.get(
    "/vod/{year_month}/{day}/{hour}/{camera_name}",
    description="Returns an HLS playlist for the specified date-time on the specified camera. Append /master.m3u8 or /index.m3u8 for HLS playback.",
)
def vod_hour_no_timezone(year_month: str, day: int, hour: int, camera_name: str):
    """VOD for specific hour. Uses the default timezone (UTC)."""
    return vod_hour(
        year_month, day, hour, camera_name, get_localzone_name().replace("/", ",")
    )


@router.get(
    "/vod/{year_month}/{day}/{hour}/{camera_name}/{tz_name}",
    description="Returns an HLS playlist for the specified date-time (with timezone) on the specified camera. Append /master.m3u8 or /index.m3u8 for HLS playback.",
)
def vod_hour(year_month: str, day: int, hour: int, camera_name: str, tz_name: str):
    parts = year_month.split("-")
    start_date = (
        datetime(int(parts[0]), int(parts[1]), day, hour, tzinfo=timezone.utc)
        - datetime.now(pytz.timezone(tz_name.replace(",", "/"))).utcoffset()
    )
    end_date = start_date + timedelta(hours=1) - timedelta(milliseconds=1)
    start_ts = start_date.timestamp()
    end_ts = end_date.timestamp()

    return vod_ts(camera_name, start_ts, end_ts)


@router.get(
    "/vod/event/{event_id}",
    description="Returns an HLS playlist for the specified object. Append /master.m3u8 or /index.m3u8 for HLS playback.",
)
def vod_event(event_id: str):
    try:
        event: Event = Event.get(Event.id == event_id)
    except DoesNotExist:
        logger.error(f"Event not found: {event_id}")
        return JSONResponse(
            content={
                "success": False,
                "message": "Event not found.",
            },
            status_code=404,
        )

    if not event.has_clip:
        logger.error(f"Event does not have recordings: {event_id}")
        return JSONResponse(
            content={
                "success": False,
                "message": "Recordings not available.",
            },
            status_code=404,
        )

    clip_path = os.path.join(CLIPS_DIR, f"{event.camera}-{event.id}.mp4")

    if not os.path.isfile(clip_path):
        end_ts = (
            datetime.now().timestamp() if event.end_time is None else event.end_time
        )
        vod_response = vod_ts(event.camera, event.start_time, end_ts)
        # If the recordings are not found and the event started more than 5 minutes ago, set has_clip to false
        if (
            event.start_time < datetime.now().timestamp() - 300
            and type(vod_response) is tuple
            and len(vod_response) == 2
            and vod_response[1] == 404
        ):
            Event.update(has_clip=False).where(Event.id == event_id).execute()
        return vod_response

    duration = int((event.end_time - event.start_time) * 1000)
    return JSONResponse(
        content={
            "cache": True,
            "discontinuity": False,
            "durations": [duration],
            "sequences": [{"clips": [{"type": "source", "path": clip_path}]}],
        }
    )


@router.get(
    "/events/{event_id}/snapshot.jpg",
    description="Returns a snapshot image for the specified object id. NOTE: The query params only take affect while the event is in-progress. Once the event has ended the snapshot configuration is used.",
)
def event_snapshot(
    request: Request,
    event_id: str,
    params: MediaEventsSnapshotQueryParams = Depends(),
):
    event_complete = False
    jpg_bytes = None
    try:
        event = Event.get(Event.id == event_id, Event.end_time != None)
        event_complete = True
        if not event.has_snapshot:
            return JSONResponse(
                content={"success": False, "message": "Snapshot not available"},
                status_code=404,
            )
        # read snapshot from disk
        with open(
            os.path.join(CLIPS_DIR, f"{event.camera}-{event.id}.jpg"), "rb"
        ) as image_file:
            jpg_bytes = image_file.read()
    except DoesNotExist:
        # see if the object is currently being tracked
        try:
            camera_states: list[CameraState] = (
                request.app.detected_frames_processor.camera_states.values()
            )
            for camera_state in camera_states:
                if event_id in camera_state.tracked_objects:
                    tracked_obj = camera_state.tracked_objects.get(event_id)
                    if tracked_obj is not None:
                        jpg_bytes = tracked_obj.get_img_bytes(
                            ext="jpg",
                            timestamp=params.timestamp,
                            bounding_box=params.bbox,
                            crop=params.crop,
                            height=params.height,
                            quality=params.quality,
                        )
        except Exception:
            return JSONResponse(
                content={"success": False, "message": "Ongoing event not found"},
                status_code=404,
            )
    except Exception:
        return JSONResponse(
            content={"success": False, "message": "Unknown error occurred"},
            status_code=404,
        )

    if jpg_bytes is None:
        return JSONResponse(
            content={"success": False, "message": "Live frame not available"},
            status_code=404,
        )

    headers = {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=31536000" if event_complete else "no-store",
    }

    if params.download:
        headers["Content-Disposition"] = f"attachment; filename=snapshot-{event_id}.jpg"

    return Response(
        jpg_bytes,
        media_type="image/jpeg",
        headers=headers,
    )


@router.get("/events/{event_id}/thumbnail.{extension}")
def event_thumbnail(
    request: Request,
    event_id: str,
    extension: str,
    max_cache_age: int = Query(
        2592000, description="Max cache age in seconds. Default 30 days in seconds."
    ),
    format: str = Query(default="ios", enum=["ios", "android"]),
):
    thumbnail_bytes = None
    event_complete = False
    try:
        event: Event = Event.get(Event.id == event_id)
        if event.end_time is not None:
            event_complete = True

        thumbnail_bytes = get_event_thumbnail_bytes(event)
    except DoesNotExist:
        thumbnail_bytes = None

    if thumbnail_bytes is None:
        # see if the object is currently being tracked
        try:
            camera_states = request.app.detected_frames_processor.camera_states.values()
            for camera_state in camera_states:
                if event_id in camera_state.tracked_objects:
                    tracked_obj = camera_state.tracked_objects.get(event_id)
                    if tracked_obj is not None:
                        thumbnail_bytes = tracked_obj.get_thumbnail(extension)
        except Exception:
            return JSONResponse(
                content={"success": False, "message": "Event not found"},
                status_code=404,
            )

    if thumbnail_bytes is None:
        return JSONResponse(
            content={"success": False, "message": "Event not found"},
            status_code=404,
        )

    # android notifications prefer a 2:1 ratio
    if format == "android":
        img_as_np = np.frombuffer(thumbnail_bytes, dtype=np.uint8)
        img = cv2.imdecode(img_as_np, flags=1)
        thumbnail = cv2.copyMakeBorder(
            img,
            0,
            0,
            int(img.shape[1] * 0.5),
            int(img.shape[1] * 0.5),
            cv2.BORDER_CONSTANT,
            (0, 0, 0),
        )

        quality_params = None

        if extension == "jpg" or extension == "jpeg":
            quality_params = [int(cv2.IMWRITE_JPEG_QUALITY), 70]
        elif extension == "webp":
            quality_params = [int(cv2.IMWRITE_WEBP_QUALITY), 60]

        _, img = cv2.imencode(f".{extension}", thumbnail, quality_params)
        thumbnail_bytes = img.tobytes()

    return Response(
        thumbnail_bytes,
        media_type=f"image/{extension}",
        headers={
            "Cache-Control": f"private, max-age={max_cache_age}"
            if event_complete
            else "no-store",
            "Content-Type": f"image/{extension}",
        },
    )


@router.get("/{camera_name}/grid.jpg")
def grid_snapshot(
    request: Request, camera_name: str, color: str = "green", font_scale: float = 0.5
):
    if camera_name in request.app.frigate_config.cameras:
        detect = request.app.frigate_config.cameras[camera_name].detect
        frame_processor: TrackedObjectProcessor = request.app.detected_frames_processor
        frame = frame_processor.get_current_frame(camera_name, {})
        retry_interval = float(
            request.app.frigate_config.cameras.get(camera_name).ffmpeg.retry_interval
            or 10
        )

        if frame is None or datetime.now().timestamp() > (
            frame_processor.get_current_frame_time(camera_name) + retry_interval
        ):
            return JSONResponse(
                content={"success": False, "message": "Unable to get valid frame"},
                status_code=500,
            )

        try:
            grid = (
                Regions.select(Regions.grid)
                .where(Regions.camera == camera_name)
                .get()
                .grid
            )
        except DoesNotExist:
            return JSONResponse(
                content={"success": False, "message": "Unable to get region grid"},
                status_code=500,
            )

        color_arg = color.lower()

        if color_arg == "red":
            draw_color = (0, 0, 255)
        elif color_arg == "blue":
            draw_color = (255, 0, 0)
        elif color_arg == "black":
            draw_color = (0, 0, 0)
        elif color_arg == "white":
            draw_color = (255, 255, 255)
        else:
            draw_color = (0, 255, 0)  # green

        grid_size = len(grid)
        grid_coef = 1.0 / grid_size
        width = detect.width
        height = detect.height
        for x in range(grid_size):
            for y in range(grid_size):
                cell = grid[x][y]

                if len(cell["sizes"]) == 0:
                    continue

                std_dev = round(cell["std_dev"] * width, 2)
                mean = round(cell["mean"] * width, 2)
                cv2.rectangle(
                    frame,
                    (int(x * grid_coef * width), int(y * grid_coef * height)),
                    (
                        int((x + 1) * grid_coef * width),
                        int((y + 1) * grid_coef * height),
                    ),
                    draw_color,
                    2,
                )
                cv2.putText(
                    frame,
                    f"#: {len(cell['sizes'])}",
                    (
                        int(x * grid_coef * width + 10),
                        int((y * grid_coef + 0.02) * height),
                    ),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    fontScale=font_scale,
                    color=draw_color,
                    thickness=2,
                )
                cv2.putText(
                    frame,
                    f"std: {std_dev}",
                    (
                        int(x * grid_coef * width + 10),
                        int((y * grid_coef + 0.05) * height),
                    ),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    fontScale=font_scale,
                    color=draw_color,
                    thickness=2,
                )
                cv2.putText(
                    frame,
                    f"avg: {mean}",
                    (
                        int(x * grid_coef * width + 10),
                        int((y * grid_coef + 0.08) * height),
                    ),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    fontScale=font_scale,
                    color=draw_color,
                    thickness=2,
                )

        ret, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])

        return Response(
            jpg.tobytes(),
            media_type="image/jpeg",
            headers={"Cache-Control": "no-store"},
        )
    else:
        return JSONResponse(
            content={"success": False, "message": "Camera not found"},
            status_code=404,
        )


@router.get("/events/{event_id}/snapshot-clean.png")
def event_snapshot_clean(request: Request, event_id: str, download: bool = False):
    png_bytes = None
    try:
        event = Event.get(Event.id == event_id)
        snapshot_config = request.app.frigate_config.cameras[event.camera].snapshots
        if not (snapshot_config.enabled and event.has_snapshot):
            return JSONResponse(
                content={
                    "success": False,
                    "message": "Snapshots and clean_copy must be enabled in the config",
                },
                status_code=404,
            )
        if event.end_time is None:
            # see if the object is currently being tracked
            try:
                camera_states = (
                    request.app.detected_frames_processor.camera_states.values()
                )
                for camera_state in camera_states:
                    if event_id in camera_state.tracked_objects:
                        tracked_obj = camera_state.tracked_objects.get(event_id)
                        if tracked_obj is not None:
                            png_bytes = tracked_obj.get_clean_png()
                            break
            except Exception:
                return JSONResponse(
                    content={"success": False, "message": "Event not found"},
                    status_code=404,
                )
        elif not event.has_snapshot:
            return JSONResponse(
                content={"success": False, "message": "Snapshot not available"},
                status_code=404,
            )
    except DoesNotExist:
        return JSONResponse(
            content={"success": False, "message": "Event not found"}, status_code=404
        )
    if png_bytes is None:
        try:
            clean_snapshot_path = os.path.join(
                CLIPS_DIR, f"{event.camera}-{event.id}-clean.png"
            )
            if not os.path.exists(clean_snapshot_path):
                return JSONResponse(
                    content={
                        "success": False,
                        "message": "Clean snapshot not available",
                    },
                    status_code=404,
                )
            with open(
                os.path.join(CLIPS_DIR, f"{event.camera}-{event.id}-clean.png"), "rb"
            ) as image_file:
                png_bytes = image_file.read()
        except Exception:
            logger.error(f"Unable to load clean png for event: {event.id}")
            return JSONResponse(
                content={
                    "success": False,
                    "message": "Unable to load clean png for event",
                },
                status_code=400,
            )

    headers = {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=31536000",
    }

    if download:
        headers["Content-Disposition"] = (
            f"attachment; filename=snapshot-{event_id}-clean.png"
        )

    return Response(
        png_bytes,
        media_type="image/png",
        headers=headers,
    )


@router.get("/events/{event_id}/clip.mp4")
def event_clip(request: Request, event_id: str):
    try:
        event: Event = Event.get(Event.id == event_id)
    except DoesNotExist:
        return JSONResponse(
            content={"success": False, "message": "Event not found"}, status_code=404
        )

    if not event.has_clip:
        return JSONResponse(
            content={"success": False, "message": "Clip not available"}, status_code=404
        )

    end_ts = datetime.now().timestamp() if event.end_time is None else event.end_time
    return recording_clip(request, event.camera, event.start_time, end_ts)


@router.get("/events/{event_id}/preview.gif")
def event_preview(request: Request, event_id: str):
    try:
        event: Event = Event.get(Event.id == event_id)
    except DoesNotExist:
        return JSONResponse(
            content={"success": False, "message": "Event not found"}, status_code=404
        )

    start_ts = event.start_time
    end_ts = start_ts + (
        min(event.end_time - event.start_time, 20) if event.end_time else 20
    )
    return preview_gif(request, event.camera, start_ts, end_ts)


@router.get("/{camera_name}/start/{start_ts}/end/{end_ts}/preview.gif")
def preview_gif(
    request: Request,
    camera_name: str,
    start_ts: float,
    end_ts: float,
    max_cache_age: int = Query(
        2592000, description="Max cache age in seconds. Default 30 days in seconds."
    ),
):
    if datetime.fromtimestamp(start_ts) < datetime.now().replace(minute=0, second=0):
        # has preview mp4
        preview: Previews = (
            Previews.select(
                Previews.camera,
                Previews.path,
                Previews.duration,
                Previews.start_time,
                Previews.end_time,
            )
            .where(
                Previews.start_time.between(start_ts, end_ts)
                | Previews.end_time.between(start_ts, end_ts)
                | ((start_ts > Previews.start_time) & (end_ts < Previews.end_time))
            )
            .where(Previews.camera == camera_name)
            .limit(1)
            .get()
        )

        if not preview:
            return JSONResponse(
                content={"success": False, "message": "Preview not found"},
                status_code=404,
            )

        diff = start_ts - preview.start_time
        minutes = int(diff / 60)
        seconds = int(diff % 60)
        config: FrigateConfig = request.app.frigate_config
        ffmpeg_cmd = [
            config.ffmpeg.ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "warning",
            "-ss",
            f"00:{minutes}:{seconds}",
            "-t",
            f"{end_ts - start_ts}",
            "-i",
            preview.path,
            "-r",
            "8",
            "-vf",
            "setpts=0.12*PTS",
            "-loop",
            "0",
            "-c:v",
            "gif",
            "-f",
            "gif",
            "-",
        ]

        process = sp.run(
            ffmpeg_cmd,
            capture_output=True,
        )

        if process.returncode != 0:
            logger.error(process.stderr)
            return JSONResponse(
                content={"success": False, "message": "Unable to create preview gif"},
                status_code=500,
            )

        gif_bytes = process.stdout
    else:
        # need to generate from existing images
        preview_dir = os.path.join(CACHE_DIR, "preview_frames")
        file_start = f"preview_{camera_name}"
        start_file = f"{file_start}-{start_ts}.{PREVIEW_FRAME_TYPE}"
        end_file = f"{file_start}-{end_ts}.{PREVIEW_FRAME_TYPE}"
        selected_previews = []

        for file in sorted(os.listdir(preview_dir)):
            if not file.startswith(file_start):
                continue

            if file < start_file:
                continue

            if file > end_file:
                break

            selected_previews.append(f"file '{os.path.join(preview_dir, file)}'")
            selected_previews.append("duration 0.12")

        if not selected_previews:
            return JSONResponse(
                content={"success": False, "message": "Preview not found"},
                status_code=404,
            )

        last_file = selected_previews[-2]
        selected_previews.append(last_file)
        config: FrigateConfig = request.app.frigate_config

        ffmpeg_cmd = [
            config.ffmpeg.ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "warning",
            "-f",
            "concat",
            "-y",
            "-protocol_whitelist",
            "pipe,file",
            "-safe",
            "0",
            "-i",
            "/dev/stdin",
            "-loop",
            "0",
            "-c:v",
            "gif",
            "-f",
            "gif",
            "-",
        ]

        process = sp.run(
            ffmpeg_cmd,
            input=str.encode("\n".join(selected_previews)),
            capture_output=True,
        )

        if process.returncode != 0:
            logger.error(process.stderr)
            return JSONResponse(
                content={"success": False, "message": "Unable to create preview gif"},
                status_code=500,
            )

        gif_bytes = process.stdout

    return Response(
        gif_bytes,
        media_type="image/gif",
        headers={
            "Cache-Control": f"private, max-age={max_cache_age}",
            "Content-Type": "image/gif",
        },
    )


@router.get("/{camera_name}/start/{start_ts}/end/{end_ts}/preview.mp4")
def preview_mp4(
    request: Request,
    camera_name: str,
    start_ts: float,
    end_ts: float,
    max_cache_age: int = Query(
        604800, description="Max cache age in seconds. Default 7 days in seconds."
    ),
):
    file_name = sanitize_filename(f"preview_{camera_name}_{start_ts}-{end_ts}.mp4")

    if len(file_name) > 1000:
        return JSONResponse(
            content=(
                {
                    "success": False,
                    "message": "Filename exceeded max length of 1000 characters.",
                }
            ),
            status_code=403,
        )

    path = os.path.join(CACHE_DIR, file_name)

    if datetime.fromtimestamp(start_ts) < datetime.now().replace(minute=0, second=0):
        # has preview mp4
        try:
            preview: Previews = (
                Previews.select(
                    Previews.camera,
                    Previews.path,
                    Previews.duration,
                    Previews.start_time,
                    Previews.end_time,
                )
                .where(
                    Previews.start_time.between(start_ts, end_ts)
                    | Previews.end_time.between(start_ts, end_ts)
                    | ((start_ts > Previews.start_time) & (end_ts < Previews.end_time))
                )
                .where(Previews.camera == camera_name)
                .limit(1)
                .get()
            )
        except DoesNotExist:
            preview = None

        if not preview:
            return JSONResponse(
                content={"success": False, "message": "Preview not found"},
                status_code=404,
            )

        diff = start_ts - preview.start_time
        minutes = int(diff / 60)
        seconds = int(diff % 60)
        config: FrigateConfig = request.app.frigate_config
        ffmpeg_cmd = [
            config.ffmpeg.ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "warning",
            "-y",
            "-ss",
            f"00:{minutes}:{seconds}",
            "-t",
            f"{end_ts - start_ts}",
            "-i",
            preview.path,
            "-r",
            "8",
            "-vf",
            "setpts=0.12*PTS",
            "-c:v",
            "libx264",
            "-movflags",
            "+faststart",
            path,
        ]

        process = sp.run(
            ffmpeg_cmd,
            capture_output=True,
        )

        if process.returncode != 0:
            logger.error(process.stderr)
            return JSONResponse(
                content={"success": False, "message": "Unable to create preview gif"},
                status_code=500,
            )

    else:
        # need to generate from existing images
        preview_dir = os.path.join(CACHE_DIR, "preview_frames")
        file_start = f"preview_{camera_name}"
        start_file = f"{file_start}-{start_ts}.{PREVIEW_FRAME_TYPE}"
        end_file = f"{file_start}-{end_ts}.{PREVIEW_FRAME_TYPE}"
        selected_previews = []

        for file in sorted(os.listdir(preview_dir)):
            if not file.startswith(file_start):
                continue

            if file < start_file:
                continue

            if file > end_file:
                break

            selected_previews.append(f"file '{os.path.join(preview_dir, file)}'")
            selected_previews.append("duration 0.12")

        if not selected_previews:
            return JSONResponse(
                content={"success": False, "message": "Preview not found"},
                status_code=404,
            )

        last_file = selected_previews[-2]
        selected_previews.append(last_file)
        config: FrigateConfig = request.app.frigate_config

        ffmpeg_cmd = [
            config.ffmpeg.ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "warning",
            "-f",
            "concat",
            "-y",
            "-protocol_whitelist",
            "pipe,file",
            "-safe",
            "0",
            "-i",
            "/dev/stdin",
            "-c:v",
            "libx264",
            "-movflags",
            "+faststart",
            path,
        ]

        process = sp.run(
            ffmpeg_cmd,
            input=str.encode("\n".join(selected_previews)),
            capture_output=True,
        )

        if process.returncode != 0:
            logger.error(process.stderr)
            return JSONResponse(
                content={"success": False, "message": "Unable to create preview gif"},
                status_code=500,
            )

    headers = {
        "Content-Description": "File Transfer",
        "Cache-Control": f"private, max-age={max_cache_age}",
        "Content-Type": "video/mp4",
        "Content-Length": str(os.path.getsize(path)),
        # nginx: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_ignore_headers
        "X-Accel-Redirect": f"/cache/{file_name}",
    }

    return FileResponse(
        path,
        media_type="video/mp4",
        filename=file_name,
        headers=headers,
    )


@router.get("/review/{event_id}/preview")
def review_preview(
    request: Request,
    event_id: str,
    format: str = Query(default="gif", enum=["gif", "mp4"]),
):
    try:
        review: ReviewSegment = ReviewSegment.get(ReviewSegment.id == event_id)
    except DoesNotExist:
        return JSONResponse(
            content=({"success": False, "message": "Review segment not found"}),
            status_code=404,
        )

    padding = 8
    start_ts = review.start_time - padding
    end_ts = (
        review.end_time + padding if review.end_time else datetime.now().timestamp()
    )

    if format == "gif":
        return preview_gif(request, review.camera, start_ts, end_ts)
    else:
        return preview_mp4(request, review.camera, start_ts, end_ts)


@router.get("/preview/{file_name}/thumbnail.jpg")
@router.get("/preview/{file_name}/thumbnail.webp")
def preview_thumbnail(file_name: str):
    """Get a thumbnail from the cached preview frames."""
    if len(file_name) > 1000:
        return JSONResponse(
            content=(
                {"success": False, "message": "Filename exceeded max length of 1000"}
            ),
            status_code=403,
        )

    safe_file_name_current = sanitize_filename(file_name)
    preview_dir = os.path.join(CACHE_DIR, "preview_frames")

    try:
        with open(
            os.path.join(preview_dir, safe_file_name_current), "rb"
        ) as image_file:
            jpg_bytes = image_file.read()
    except FileNotFoundError:
        return JSONResponse(
            content=({"success": False, "message": "Image file not found"}),
            status_code=404,
        )

    return Response(
        jpg_bytes,
        media_type="image/webp",
        headers={
            "Content-Type": "image/webp",
            "Cache-Control": "private, max-age=31536000",
        },
    )


####################### dynamic routes ###########################


@router.get("/{camera_name}/{label}/best.jpg")
@router.get("/{camera_name}/{label}/thumbnail.jpg")
def label_thumbnail(request: Request, camera_name: str, label: str):
    label = unquote(label)
    event_query = Event.select(fn.MAX(Event.id)).where(Event.camera == camera_name)
    if label != "any":
        event_query = event_query.where(Event.label == label)

    try:
        event_id = event_query.scalar()

        return event_thumbnail(request, event_id, 60)
    except DoesNotExist:
        frame = np.zeros((175, 175, 3), np.uint8)
        ret, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])

        return Response(
            jpg.tobytes(),
            media_type="image/jpeg",
            headers={"Cache-Control": "no-store"},
        )


@router.get("/{camera_name}/{label}/clip.mp4")
def label_clip(request: Request, camera_name: str, label: str):
    label = unquote(label)
    event_query = Event.select(fn.MAX(Event.id)).where(
        Event.camera == camera_name, Event.has_clip == True
    )
    if label != "any":
        event_query = event_query.where(Event.label == label)

    try:
        event = event_query.get()

        return event_clip(request, event.id)
    except DoesNotExist:
        return JSONResponse(
            content={"success": False, "message": "Event not found"}, status_code=404
        )


@router.get("/{camera_name}/{label}/snapshot.jpg")
def label_snapshot(request: Request, camera_name: str, label: str):
    """Returns the snapshot image from the latest event for the given camera and label combo"""
    label = unquote(label)
    if label == "any":
        event_query = (
            Event.select(Event.id)
            .where(Event.camera == camera_name)
            .where(Event.has_snapshot == True)
            .order_by(Event.start_time.desc())
        )
    else:
        event_query = (
            Event.select(Event.id)
            .where(Event.camera == camera_name)
            .where(Event.label == label)
            .where(Event.has_snapshot == True)
            .order_by(Event.start_time.desc())
        )

    try:
        event: Event = event_query.get()
        return event_snapshot(request, event.id, MediaEventsSnapshotQueryParams())
    except DoesNotExist:
        frame = np.zeros((720, 1280, 3), np.uint8)
        _, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])

        return Response(
            jpg.tobytes(),
            media_type="image/jpeg",
        )
