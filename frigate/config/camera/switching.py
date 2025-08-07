"""Camera switching configuration for handling shared RTSP streams."""

from typing import Any

from pydantic import Field

from ..base import FrigateBaseModel

__all__ = ["CameraSwitchingConfig"]


class CameraSwitchingThresholds(FrigateBaseModel):
    """Thresholds for detecting camera switches."""

    resolution_change: bool = Field(
        default=True, title="Trigger reset on any resolution change"
    )
    codec_change: bool = Field(default=True, title="Trigger reset on any codec change")
    fps_change_percent: float = Field(
        default=50.0,
        title="Trigger reset when FPS changes by this percentage",
        ge=0.0,
        le=100.0,
    )
    error_spike_count: int = Field(
        default=5, title="Trigger reset when error count reaches this threshold", ge=1
    )


class CameraSwitchingConfig(FrigateBaseModel):
    """Configuration for camera switching detection and handling."""

    enabled: bool = Field(
        default=False, title="Enable automatic camera switch detection and stream reset"
    )

    check_interval: float = Field(
        default=5.0,
        title="Interval in seconds between stream health checks",
        ge=1.0,
        le=60.0,
    )

    reset_cooldown: float = Field(
        default=30.0,
        title="Minimum seconds between resets for the same camera",
        ge=5.0,
        le=300.0,
    )

    thresholds: CameraSwitchingThresholds = Field(
        default_factory=CameraSwitchingThresholds,
        title="Detection thresholds for camera switches",
    )

    go2rtc_api_url: str = Field(
        default="http://localhost:1984/api", title="URL for go2rtc API"
    )

    def __init__(self, **data: Any):
        super().__init__(**data)
