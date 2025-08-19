from typing import Optional

from pydantic import BaseModel, Field


class RecordingsBackfillBody(BaseModel):
    start_time: Optional[float] = Field(
        None, description="Start timestamp for backfill range (UTC)"
    )
    end_time: Optional[float] = Field(
        None, description="End timestamp for backfill range (UTC)"
    )
    date_filter: Optional[str] = Field(
        None, description="Filter by specific date (format: YYYY-MM-DD)"
    )
    directory_path: Optional[str] = Field(
        None, description="Custom directory path to scan for recordings"
    )
    dry_run: bool = Field(
        False,
        description="If True, only scan and report what would be backfilled without making changes",
    )
    force: bool = Field(
        False, description="If True, overwrite existing database entries"
    )


class RecordingsBackfillScheduleBody(BaseModel):
    enabled: bool = Field(True, description="Whether automated backfill is enabled")
    interval_hours: int = Field(24, description="How often to run backfill (in hours)")
    retention_days: int = Field(
        7, description="How many days back to check for missing recordings"
    )
