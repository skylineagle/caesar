from typing import Optional, Union

from pydantic import BaseModel, Field, field_validator


class RecordingsBackfillBody(BaseModel):
    start_time: Optional[Union[float, str]] = Field(
        None,
        description="Start timestamp for backfill range (UTC) - Unix timestamp (float) or ISO format (string)",
    )
    end_time: Optional[Union[float, str]] = Field(
        None,
        description="End timestamp for backfill range (UTC) - Unix timestamp (float) or ISO format (string)",
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

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def validate_timestamp(cls, v):
        """Validate and convert timestamp to float format."""
        if v is None:
            return None

        # If it's already a number, return as is
        if isinstance(v, (int, float)):
            return float(v)

        # If it's a string, try to parse it
        if isinstance(v, str):
            try:
                # Try to parse as float first
                return float(v)
            except ValueError:
                try:
                    # Try to parse as ISO format
                    from dateutil import parser

                    dt = parser.isoparse(v)
                    return dt.timestamp()
                except ValueError:
                    raise ValueError(
                        f"Invalid timestamp format: {v}. Use Unix timestamp (e.g., 1693526400) or ISO format (e.g., 2023-09-01T00:00:00Z)"
                    )

        raise ValueError(
            f"Invalid timestamp type: {type(v)}. Expected number or string."
        )


class RecordingsBackfillScheduleBody(BaseModel):
    enabled: bool = Field(True, description="Whether automated backfill is enabled")
    interval_hours: int = Field(24, description="How often to run backfill (in hours)")
    retention_days: int = Field(
        7, description="How many days back to check for missing recordings"
    )
