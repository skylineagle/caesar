"""Review apis."""

import datetime
import logging
from functools import reduce
from pathlib import Path

import pandas as pd
from fastapi import APIRouter
from fastapi.params import Depends
from fastapi.responses import JSONResponse
from peewee import Case, DoesNotExist, IntegrityError, fn, operator
from playhouse.shortcuts import model_to_dict

from frigate.api.auth import get_current_user, require_role
from frigate.api.defs.query.review_query_parameters import (
    ReviewActivityMotionQueryParams,
    ReviewQueryParams,
    ReviewSummaryQueryParams,
)
from frigate.api.defs.request.review_body import ReviewModifyMultipleBody
from frigate.api.defs.response.generic_response import GenericResponse
from frigate.api.defs.response.review_response import (
    ReviewActivityMotionResponse,
    ReviewSegmentResponse,
    ReviewSummaryResponse,
)
from frigate.api.defs.tags import Tags
from frigate.models import Recordings, ReviewSegment, UserReviewStatus
from frigate.review.types import SeverityEnum
from frigate.util.builtin import get_tz_modifiers

logger = logging.getLogger(__name__)

router = APIRouter(tags=[Tags.review])


@router.get("/review", response_model=list[ReviewSegmentResponse])
async def review(
    params: ReviewQueryParams = Depends(),
    current_user: dict = Depends(get_current_user),
):
    if isinstance(current_user, JSONResponse):
        return current_user

    user_id = current_user["username"]

    cameras = params.cameras
    labels = params.labels
    zones = params.zones
    reviewed = params.reviewed
    limit = params.limit
    severity = params.severity
    before = params.before or datetime.datetime.now().timestamp()
    after = (
        params.after
        or (datetime.datetime.now() - datetime.timedelta(hours=24)).timestamp()
    )

    clauses = [
        (ReviewSegment.start_time < before)
        & ((ReviewSegment.end_time.is_null(True)) | (ReviewSegment.end_time > after))
    ]

    if cameras != "all":
        camera_list = cameras.split(",")
        clauses.append((ReviewSegment.camera << camera_list))

    if labels != "all":
        # use matching so segments with multiple labels
        # still match on a search where any label matches
        label_clauses = []
        filtered_labels = labels.split(",")

        for label in filtered_labels:
            label_clauses.append(
                (ReviewSegment.data["objects"].cast("text") % f'*"{label}"*')
                | (ReviewSegment.data["audio"].cast("text") % f'*"{label}"*')
            )
        clauses.append(reduce(operator.or_, label_clauses))

    if zones != "all":
        # use matching so segments with multiple zones
        # still match on a search where any zone matches
        zone_clauses = []
        filtered_zones = zones.split(",")

        for zone in filtered_zones:
            zone_clauses.append(
                (ReviewSegment.data["zones"].cast("text") % f'*"{zone}"*')
            )
        clauses.append(reduce(operator.or_, zone_clauses))

    if severity:
        clauses.append((ReviewSegment.severity == severity))

    # Join with UserReviewStatus to get per-user review status
    review_query = (
        ReviewSegment.select(
            ReviewSegment.id,
            ReviewSegment.camera,
            ReviewSegment.start_time,
            ReviewSegment.end_time,
            ReviewSegment.severity,
            ReviewSegment.thumb_path,
            ReviewSegment.data,
            fn.COALESCE(UserReviewStatus.has_been_reviewed, False).alias(
                "has_been_reviewed"
            ),
        )
        .left_outer_join(
            UserReviewStatus,
            on=(
                (ReviewSegment.id == UserReviewStatus.review_segment)
                & (UserReviewStatus.user_id == user_id)
            ),
        )
        .where(reduce(operator.and_, clauses))
    )

    # Filter unreviewed items without subquery
    if reviewed == 0:
        review_query = review_query.where(
            (UserReviewStatus.has_been_reviewed == False)
            | (UserReviewStatus.has_been_reviewed.is_null())
        )

    # Apply ordering and limit
    review_query = (
        review_query.order_by(ReviewSegment.severity.asc())
        .order_by(ReviewSegment.start_time.desc())
        .limit(limit)
        .dicts()
        .iterator()
    )

    return JSONResponse(content=[r for r in review_query])


@router.get("/review_ids", response_model=list[ReviewSegmentResponse])
def review_ids(ids: str):
    ids = ids.split(",")

    if not ids:
        return JSONResponse(
            content=({"success": False, "message": "Valid list of ids must be sent"}),
            status_code=400,
        )

    try:
        reviews = (
            ReviewSegment.select().where(ReviewSegment.id << ids).dicts().iterator()
        )
        return JSONResponse(list(reviews))
    except Exception:
        return JSONResponse(
            content=({"success": False, "message": "Review segments not found"}),
            status_code=400,
        )


@router.get("/review/summary", response_model=ReviewSummaryResponse)
async def review_summary(
    params: ReviewSummaryQueryParams = Depends(),
    current_user: dict = Depends(get_current_user),
):
    if isinstance(current_user, JSONResponse):
        return current_user

    user_id = current_user["username"]

    hour_modifier, minute_modifier, seconds_offset = get_tz_modifiers(params.timezone)
    day_ago = (datetime.datetime.now() - datetime.timedelta(hours=24)).timestamp()

    cameras = params.cameras
    labels = params.labels
    zones = params.zones

    clauses = [(ReviewSegment.start_time > day_ago)]

    if cameras != "all":
        camera_list = cameras.split(",")
        clauses.append((ReviewSegment.camera << camera_list))

    if labels != "all":
        # use matching so segments with multiple labels
        # still match on a search where any label matches
        label_clauses = []
        filtered_labels = labels.split(",")

        for label in filtered_labels:
            label_clauses.append(
                (ReviewSegment.data["objects"].cast("text") % f'*"{label}"*')
                | (ReviewSegment.data["audio"].cast("text") % f'*"{label}"*')
            )
        clauses.append(reduce(operator.or_, label_clauses))
    if zones != "all":
        # use matching so segments with multiple zones
        # still match on a search where any zone matches
        zone_clauses = []
        filtered_zones = zones.split(",")

        for zone in filtered_zones:
            zone_clauses.append(
                ReviewSegment.data["zones"].cast("text") % f'*"{zone}"*'
            )
        clauses.append(reduce(operator.or_, zone_clauses))

    last_24_query = (
        ReviewSegment.select(
            fn.SUM(
                Case(
                    None,
                    [
                        (
                            (ReviewSegment.severity == SeverityEnum.alert)
                            & (UserReviewStatus.has_been_reviewed == True),
                            1,
                        )
                    ],
                    0,
                )
            ).alias("reviewed_alert"),
            fn.SUM(
                Case(
                    None,
                    [
                        (
                            (ReviewSegment.severity == SeverityEnum.detection)
                            & (UserReviewStatus.has_been_reviewed == True),
                            1,
                        )
                    ],
                    0,
                )
            ).alias("reviewed_detection"),
            fn.SUM(
                Case(
                    None,
                    [
                        (
                            (ReviewSegment.severity == SeverityEnum.alert),
                            1,
                        )
                    ],
                    0,
                )
            ).alias("total_alert"),
            fn.SUM(
                Case(
                    None,
                    [
                        (
                            (ReviewSegment.severity == SeverityEnum.detection),
                            1,
                        )
                    ],
                    0,
                )
            ).alias("total_detection"),
        )
        .left_outer_join(
            UserReviewStatus,
            on=(
                (ReviewSegment.id == UserReviewStatus.review_segment)
                & (UserReviewStatus.user_id == user_id)
            ),
        )
        .where(reduce(operator.and_, clauses))
        .dicts()
        .get()
    )

    clauses = []

    if cameras != "all":
        camera_list = cameras.split(",")
        clauses.append((ReviewSegment.camera << camera_list))

    if labels != "all":
        # use matching so segments with multiple labels
        # still match on a search where any label matches
        label_clauses = []
        filtered_labels = labels.split(",")

        for label in filtered_labels:
            label_clauses.append(
                ReviewSegment.data["objects"].cast("text") % f'*"{label}"*'
            )
        clauses.append(reduce(operator.or_, label_clauses))

    day_in_seconds = 60 * 60 * 24
    last_month_query = (
        ReviewSegment.select(
            fn.strftime(
                "%Y-%m-%d",
                fn.datetime(
                    ReviewSegment.start_time,
                    "unixepoch",
                    hour_modifier,
                    minute_modifier,
                ),
            ).alias("day"),
            fn.SUM(
                Case(
                    None,
                    [
                        (
                            (ReviewSegment.severity == SeverityEnum.alert)
                            & (UserReviewStatus.has_been_reviewed == True),
                            1,
                        )
                    ],
                    0,
                )
            ).alias("reviewed_alert"),
            fn.SUM(
                Case(
                    None,
                    [
                        (
                            (ReviewSegment.severity == SeverityEnum.detection)
                            & (UserReviewStatus.has_been_reviewed == True),
                            1,
                        )
                    ],
                    0,
                )
            ).alias("reviewed_detection"),
            fn.SUM(
                Case(
                    None,
                    [
                        (
                            (ReviewSegment.severity == SeverityEnum.alert),
                            1,
                        )
                    ],
                    0,
                )
            ).alias("total_alert"),
            fn.SUM(
                Case(
                    None,
                    [
                        (
                            (ReviewSegment.severity == SeverityEnum.detection),
                            1,
                        )
                    ],
                    0,
                )
            ).alias("total_detection"),
        )
        .left_outer_join(
            UserReviewStatus,
            on=(
                (ReviewSegment.id == UserReviewStatus.review_segment)
                & (UserReviewStatus.user_id == user_id)
            ),
        )
        .where(reduce(operator.and_, clauses) if clauses else True)
        .group_by(
            (ReviewSegment.start_time + seconds_offset).cast("int") / day_in_seconds
        )
        .order_by(ReviewSegment.start_time.desc())
    )

    data = {
        "last24Hours": last_24_query,
    }

    for e in last_month_query.dicts().iterator():
        data[e["day"]] = e

    return JSONResponse(content=data)


@router.post("/reviews/viewed", response_model=GenericResponse)
async def set_multiple_reviewed(
    body: ReviewModifyMultipleBody,
    current_user: dict = Depends(get_current_user),
):
    if isinstance(current_user, JSONResponse):
        return current_user

    user_id = current_user["username"]

    for review_id in body.ids:
        try:
            review_status = UserReviewStatus.get(
                UserReviewStatus.user_id == user_id,
                UserReviewStatus.review_segment == review_id,
            )
            # If it exists and isn’t reviewed, update it
            if not review_status.has_been_reviewed:
                review_status.has_been_reviewed = True
                review_status.save()
        except DoesNotExist:
            try:
                UserReviewStatus.create(
                    user_id=user_id,
                    review_segment=ReviewSegment.get(id=review_id),
                    has_been_reviewed=True,
                )
            except (DoesNotExist, IntegrityError):
                pass

    return JSONResponse(
        content=({"success": True, "message": "Reviewed multiple items"}),
        status_code=200,
    )


@router.post(
    "/reviews/delete",
    response_model=GenericResponse,
    dependencies=[Depends(require_role(["admin"]))],
)
def delete_reviews(body: ReviewModifyMultipleBody):
    list_of_ids = body.ids
    reviews = (
        ReviewSegment.select(
            ReviewSegment.camera,
            ReviewSegment.start_time,
            ReviewSegment.end_time,
        )
        .where(ReviewSegment.id << list_of_ids)
        .dicts()
        .iterator()
    )
    recording_ids = []

    for review in reviews:
        start_time = review["start_time"]
        end_time = review["end_time"]
        camera_name = review["camera"]
        recordings = (
            Recordings.select(Recordings.id, Recordings.path)
            .where(
                Recordings.start_time.between(start_time, end_time)
                | Recordings.end_time.between(start_time, end_time)
                | (
                    (start_time > Recordings.start_time)
                    & (end_time < Recordings.end_time)
                )
            )
            .where(Recordings.camera == camera_name)
            .dicts()
            .iterator()
        )

        for recording in recordings:
            Path(recording["path"]).unlink(missing_ok=True)
            recording_ids.append(recording["id"])

    # delete recordings and review segments
    Recordings.delete().where(Recordings.id << recording_ids).execute()
    ReviewSegment.delete().where(ReviewSegment.id << list_of_ids).execute()
    UserReviewStatus.delete().where(
        UserReviewStatus.review_segment << list_of_ids
    ).execute()

    return JSONResponse(
        content=({"success": True, "message": "Deleted review items."}), status_code=200
    )


@router.get(
    "/review/activity/motion", response_model=list[ReviewActivityMotionResponse]
)
def motion_activity(params: ReviewActivityMotionQueryParams = Depends()):
    """Get motion and audio activity."""
    cameras = params.cameras
    before = params.before or datetime.datetime.now().timestamp()
    after = (
        params.after
        or (datetime.datetime.now() - datetime.timedelta(hours=1)).timestamp()
    )
    # get scale in seconds
    scale = params.scale

    clauses = [(Recordings.start_time > after) & (Recordings.end_time < before)]
    clauses.append((Recordings.motion > 0))

    if cameras != "all":
        camera_list = cameras.split(",")
        clauses.append((Recordings.camera << camera_list))

    data: list[Recordings] = (
        Recordings.select(
            Recordings.camera,
            Recordings.start_time,
            Recordings.motion,
        )
        .where(reduce(operator.and_, clauses))
        .order_by(Recordings.start_time.asc())
        .dicts()
        .iterator()
    )

    # resample data using pandas to get activity on scaled basis
    df = pd.DataFrame(data, columns=["start_time", "motion", "camera"])

    if df.empty:
        logger.warning("No motion data found for the requested time range")
        return JSONResponse(content=[])

    df = df.astype(dtype={"motion": "float32"})

    # set date as datetime index
    df["start_time"] = pd.to_datetime(df["start_time"], unit="s")
    df.set_index(["start_time"], inplace=True)

    # normalize data
    motion = (
        df["motion"]
        .resample(f"{scale}s")
        .apply(lambda x: max(x, key=abs, default=0.0))
        .fillna(0.0)
        .to_frame()
    )
    cameras = df["camera"].resample(f"{scale}s").agg(lambda x: ",".join(set(x)))
    df = motion.join(cameras)

    length = df.shape[0]
    chunk = int(60 * (60 / scale))

    for i in range(0, length, chunk):
        part = df.iloc[i : i + chunk]
        min_val, max_val = part["motion"].min(), part["motion"].max()
        if min_val != max_val:
            df.iloc[i : i + chunk, 0] = (
                part["motion"].sub(min_val).div(max_val - min_val).mul(100).fillna(0)
            )
        else:
            df.iloc[i : i + chunk, 0] = 0.0

    # change types for output
    df.index = df.index.astype(int) // (10**9)
    normalized = df.reset_index().to_dict("records")
    return JSONResponse(content=normalized)


@router.get("/review/event/{event_id}", response_model=ReviewSegmentResponse)
def get_review_from_event(event_id: str):
    try:
        return JSONResponse(
            model_to_dict(
                ReviewSegment.get(
                    ReviewSegment.data["detections"].cast("text") % f'*"{event_id}"*'
                )
            )
        )
    except DoesNotExist:
        return JSONResponse(
            content={"success": False, "message": "Review item not found"},
            status_code=404,
        )


@router.get("/review/{review_id}", response_model=ReviewSegmentResponse)
def get_review(review_id: str):
    try:
        return JSONResponse(
            content=model_to_dict(ReviewSegment.get(ReviewSegment.id == review_id))
        )
    except DoesNotExist:
        return JSONResponse(
            content={"success": False, "message": "Review item not found"},
            status_code=404,
        )


@router.delete("/review/{review_id}/viewed", response_model=GenericResponse)
async def set_not_reviewed(
    review_id: str,
    current_user: dict = Depends(get_current_user),
):
    if isinstance(current_user, JSONResponse):
        return current_user

    user_id = current_user["username"]

    try:
        review: ReviewSegment = ReviewSegment.get(ReviewSegment.id == review_id)
    except DoesNotExist:
        return JSONResponse(
            content=(
                {"success": False, "message": "Review " + review_id + " not found"}
            ),
            status_code=404,
        )

    try:
        user_review = UserReviewStatus.get(
            UserReviewStatus.user_id == user_id,
            UserReviewStatus.review_segment == review,
        )
        # we could update here instead of delete if we need
        user_review.delete_instance()
    except DoesNotExist:
        pass  # Already effectively "not reviewed"

    return JSONResponse(
        content=({"success": True, "message": f"Set Review {review_id} as not viewed"}),
        status_code=200,
    )
