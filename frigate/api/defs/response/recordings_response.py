from typing import List, Optional

from pydantic import BaseModel, Field


class RecordingBackfillResult(BaseModel):
    file_path: str = Field(..., description="Path to the recording file")
    start_time: float = Field(..., description="Start timestamp of the recording")
    end_time: float = Field(..., description="End timestamp of the recording")
    duration: float = Field(..., description="Duration of the recording in seconds")
    file_size_mb: float = Field(..., description="File size in MB")
    status: str = Field(
        ..., description="Status of the backfill operation (added, skipped, error)"
    )


class RecordingsBackfillResponse(BaseModel):
    success: bool = Field(
        ..., description="Whether the backfill operation was successful"
    )
    message: str = Field(..., description="Human-readable message about the operation")
    camera_name: str = Field(..., description="Name of the camera that was processed")
    total_files_scanned: int = Field(..., description="Total number of files scanned")
    files_added: int = Field(..., description="Number of files added to database")
    files_skipped: int = Field(
        ..., description="Number of files skipped (already in database)"
    )
    files_errors: int = Field(..., description="Number of files that had errors")
    results: List[RecordingBackfillResult] = Field(
        ..., description="Detailed results for each file"
    )
    processing_time_seconds: float = Field(
        ..., description="Time taken to process the backfill operation"
    )


class RecordingsBackfillScheduleResponse(BaseModel):
    success: bool = Field(
        ..., description="Whether the schedule operation was successful"
    )
    message: str = Field(..., description="Human-readable message about the operation")
    camera_name: str = Field(..., description="Name of the camera")
    enabled: bool = Field(..., description="Whether automated backfill is enabled")
    interval_hours: int = Field(..., description="How often backfill runs (in hours)")
    retention_days: int = Field(..., description="How many days back to check")
    next_run: Optional[float] = Field(None, description="Next scheduled run timestamp")
