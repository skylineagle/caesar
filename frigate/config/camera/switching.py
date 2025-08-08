"""Camera switching configuration for handling shared RTSP streams."""

from pydantic import Field

from frigate.config.base import FrigateBaseModel

__all__ = ["CameraSwitchingConfig", "CameraSwitchingGlobalConfig"]


class CameraSwitchingThresholds(FrigateBaseModel):
    """Detection thresholds for camera switches."""

    resolution_change: bool = Field(
        default=True, title="Detect camera switches based on resolution changes"
    )

    codec_change: bool = Field(
        default=True, title="Detect camera switches based on codec changes"
    )

    fps_change_percent: float = Field(
        default=20.0,
        title="Percentage change in FPS to trigger switch detection",
        ge=1.0,
        le=100.0,
    )

    error_spike_count: int = Field(
        default=5,
        title="Number of consecutive errors to trigger switch detection",
        ge=1,
        le=50,
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


class CameraSwitchingGlobalConfig(FrigateBaseModel):
    """Global configuration for camera switching feature."""

    enabled: bool = Field(
        default=False,
        title="Enable camera switching feature globally. When disabled, no camera switching code will execute.",
    )
