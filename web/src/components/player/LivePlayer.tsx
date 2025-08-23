import { baseUrl } from "@/api/baseUrl";
import { VideoEffectsControl } from "@/components/player/VideoEffectsControl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCameraActivity } from "@/hooks/use-camera-activity";
import { useCameraFriendlyName } from "@/hooks/use-camera-friendly-name";
import {
  useContainerVideoEffects,
  useHasActiveVideoContent,
  usePersistedVideoEffects,
} from "@/hooks/use-video-effects";
import { cn } from "@/lib/utils";
import { CameraConfig } from "@/types/frigateConfig";
import {
  LivePlayerError,
  LivePlayerMode,
  PlayerStatsType,
  VideoResolutionType,
} from "@/types/live";
import { getIconForLabel } from "@/utils/iconUtil";
import { capitalizeFirstLetter } from "@/utils/stringUtil";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuRefreshCw, LuVideoOff } from "react-icons/lu";
import { MdCircle } from "react-icons/md";
import AutoUpdatingCameraImage from "../camera/AutoUpdatingCameraImage";
import ActivityIndicator from "../indicators/activity-indicator";
import Chip from "../indicators/Chip";
import JSMpegPlayer from "./JSMpegPlayer";
import MSEPlayer from "./MsePlayer";
import { PlayerStats } from "./PlayerStats";
import WebRtcPlayer from "./WebRTCPlayer";

type LivePlayerProps = {
  cameraRef?: (ref: HTMLDivElement | null) => void;
  containerRef?: React.MutableRefObject<HTMLDivElement | null>;
  className?: string;
  cameraConfig: CameraConfig;
  streamName: string;
  preferredLiveMode: LivePlayerMode;
  showStillWithoutActivity?: boolean;
  useWebGL: boolean;
  windowVisible?: boolean;
  playAudio?: boolean;
  volume?: number;
  playInBackground: boolean;
  micEnabled?: boolean;
  iOSCompatFullScreen?: boolean;
  pip?: boolean;
  autoLive?: boolean;
  showStats?: boolean;
  onClick?: () => void;
  setFullResolution?: React.Dispatch<React.SetStateAction<VideoResolutionType>>;
  onError?: (error: LivePlayerError) => void;
  onResetLiveMode?: () => void;
  videoEffects?: boolean;
  streamIndex?: number;
};

export default function LivePlayer({
  cameraRef = undefined,
  containerRef,
  className,
  cameraConfig,
  streamName,
  preferredLiveMode,
  showStillWithoutActivity = false,
  useWebGL = false,
  windowVisible = true,
  playAudio = false,
  volume,
  playInBackground = false,
  micEnabled = false,
  iOSCompatFullScreen = false,
  pip,
  autoLive = true,
  showStats = false,
  onClick,
  setFullResolution,
  onError,
  onResetLiveMode,
  videoEffects,
  streamIndex = 0,
}: LivePlayerProps) {
  const { t } = useTranslation(["common", "components/player"]);

  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  const pointerDownPositionRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const clickSuppressDistancePx = 8;

  const cameraName = useCameraFriendlyName(cameraConfig);
  // stats

  // player state
  const [liveReady, setLiveReady] = useState(false);
  const [stats, setStats] = useState<PlayerStatsType>({
    streamType: "-",
    bandwidth: 0,
    latency: undefined,
    totalFrames: 0,
    droppedFrames: undefined,
    decodedFrames: 0,
    droppedFrameRate: 0,
  });

  const {
    effects: currentVideoEffects,
    updateEffects: setCurrentVideoEffects,
  } = usePersistedVideoEffects(cameraConfig.name);

  const hasActiveVideoContent = useHasActiveVideoContent(internalContainerRef);

  const { applyEffects } = useContainerVideoEffects(
    internalContainerRef,
    currentVideoEffects,
  );

  // Apply effects when they change and we have active content
  useEffect(() => {
    if (hasActiveVideoContent && liveReady && applyEffects) {
      // Debounced effect application to reduce performance impact
      const timeoutId = setTimeout(() => {
        try {
          applyEffects();
        } catch (error) {
          // Silently handle video effects errors to prevent crashes
        }
      }, 250);
      return () => clearTimeout(timeoutId);
    }
  }, [currentVideoEffects, hasActiveVideoContent, liveReady, applyEffects]);

  const {
    enabled: cameraEnabled,
    activeMotion,
    activeTracking,
    objects,
    offline,
  } = useCameraActivity(cameraConfig);

  // Generate stable key for player components - only change on essential changes
  const playerKey = useMemo(() => {
    return `${cameraConfig.name}_${streamName}_${preferredLiveMode}`;
  }, [cameraConfig.name, streamName, preferredLiveMode]);

  const cameraActive = useMemo(
    () =>
      !showStillWithoutActivity ||
      (windowVisible && (activeMotion || activeTracking)),
    [activeMotion, activeTracking, showStillWithoutActivity, windowVisible],
  );

  const liveReadyRef = useRef(liveReady);
  const cameraActiveRef = useRef(cameraActive);

  useEffect(() => {
    liveReadyRef.current = liveReady;
    cameraActiveRef.current = cameraActive;
  }, [liveReady, cameraActive]);

  useEffect(() => {
    if (!autoLive) {
      return;
    }

    if (cameraActive && !liveReady) {
      // Immediately start stream when camera becomes active
      setLiveReady(true);
    } else if (!cameraActive && liveReady) {
      const timer = setTimeout(() => {
        if (liveReadyRef.current && !cameraActiveRef.current) {
          setLiveReady(false);
          onResetLiveMode?.();
        }
      }, 2000); // Increased delay to avoid unnecessary stream stops

      return () => {
        clearTimeout(timer);
      };
    }
    // live mode won't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLive, cameraActive, liveReady]);

  // Force stream restart when camera comes back online after being offline
  useEffect(() => {
    if (!offline && cameraEnabled && autoLive && !liveReady) {
      setLiveReady(true);
    }
  }, [offline, cameraEnabled, autoLive, liveReady]);

  // camera still state

  const stillReloadInterval = useMemo(() => {
    if (!windowVisible || offline || !showStillWithoutActivity) {
      return -1; // no reason to update the image when the window is not visible
    }

    if (liveReady && !cameraActive) {
      return 300;
    }

    if (liveReady) {
      return 60000;
    }

    if (activeMotion || activeTracking) {
      if (autoLive) {
        return 50; // Faster response when motion detected
      } else {
        return 59000;
      }
    }

    return 30000;
  }, [
    autoLive,
    showStillWithoutActivity,
    liveReady,
    activeMotion,
    activeTracking,
    offline,
    windowVisible,
    cameraActive,
  ]);

  useEffect(() => {
    setLiveReady(false);
  }, [preferredLiveMode]);

  const resetPlayer = () => {
    setLiveReady(false);
  };

  useEffect(() => {
    if (streamName) {
      resetPlayer();
    }
  }, [streamName]);

  useEffect(() => {
    if (showStillWithoutActivity && !autoLive) {
      setLiveReady(false);
    }
  }, [showStillWithoutActivity, autoLive]);

  const playerIsPlaying = useCallback(() => {
    setLiveReady(true);
  }, []);

  const [isReEnabling, setIsReEnabling] = useState(false);
  const prevCameraEnabledRef = useRef(cameraEnabled ?? true);

  useEffect(() => {
    if (cameraEnabled == undefined) {
      return;
    }
    if (!prevCameraEnabledRef.current && cameraEnabled) {
      setLiveReady(false);
      setIsReEnabling(true);
    } else if (prevCameraEnabledRef.current && !cameraEnabled) {
      setLiveReady(false);
    }
    prevCameraEnabledRef.current = cameraEnabled;
  }, [cameraEnabled]);

  useEffect(() => {
    if (liveReady && isReEnabling) {
      setIsReEnabling(false);
    }
  }, [liveReady, isReEnabling]);

  const handlePointerDown = useCallback((x: number, y: number) => {
    pointerDownPositionRef.current = { x, y };
    hasDraggedRef.current = false;
  }, []);

  const handlePointerMove = useCallback((x: number, y: number) => {
    if (!pointerDownPositionRef.current) {
      return;
    }
    const dx = x - pointerDownPositionRef.current.x;
    const dy = y - pointerDownPositionRef.current.y;
    if (Math.hypot(dx, dy) > clickSuppressDistancePx) {
      hasDraggedRef.current = true;
    }
  }, []);

  const handlePointerUp = useCallback(() => {}, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      handlePointerDown(e.clientX, e.clientY);
    },
    [handlePointerDown],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      handlePointerMove(e.clientX, e.clientY);
    },
    [handlePointerMove],
  );

  const handleMouseUp = useCallback(() => {
    handlePointerUp();
  }, [handlePointerUp]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const t = e.touches[0] ?? e.changedTouches[0];
      if (!t) {
        return;
      }
      handlePointerDown(t.clientX, t.clientY);
    },
    [handlePointerDown],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const t = e.touches[0] ?? e.changedTouches[0];
      if (!t) {
        return;
      }
      handlePointerMove(t.clientX, t.clientY);
    },
    [handlePointerMove],
  );

  const handleTouchEnd = useCallback(() => {
    handlePointerUp();
  }, [handlePointerUp]);

  const handleTileClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const down = pointerDownPositionRef.current;
      if (down) {
        const dx = e.clientX - down.x;
        const dy = e.clientY - down.y;
        if (Math.hypot(dx, dy) > clickSuppressDistancePx) {
          hasDraggedRef.current = true;
        }
      }
      if (hasDraggedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        hasDraggedRef.current = false;
        pointerDownPositionRef.current = null;
        return;
      }
      pointerDownPositionRef.current = null;
      onClick?.();
    },
    [onClick],
  );

  if (!cameraConfig) {
    return <ActivityIndicator />;
  }

  let player;
  if (!autoLive || !streamName || !cameraEnabled) {
    player = null;
  } else if (preferredLiveMode == "webrtc") {
    player = (
      <WebRtcPlayer
        key={"webrtc_" + playerKey}
        className={`size-full rounded-lg md:rounded-lg ${liveReady ? "" : "hidden"}`}
        camera={streamName}
        playbackEnabled={cameraActive || liveReady}
        getStats={showStats}
        setStats={setStats}
        audioEnabled={playAudio}
        volume={volume}
        microphoneEnabled={micEnabled}
        iOSCompatFullScreen={iOSCompatFullScreen}
        onPlaying={playerIsPlaying}
        pip={pip}
        onError={onError}
        streamIndex={streamIndex}
      />
    );
  } else if (preferredLiveMode == "mse") {
    if ("MediaSource" in window || "ManagedMediaSource" in window) {
      player = (
        <MSEPlayer
          key={`mse_${playerKey}`}
          className={`size-full rounded-lg md:rounded-lg ${liveReady ? "" : "hidden"}`}
          camera={streamName}
          playbackEnabled={cameraActive || liveReady}
          audioEnabled={playAudio}
          volume={volume}
          playInBackground={playInBackground}
          getStats={showStats}
          setStats={setStats}
          onPlaying={playerIsPlaying}
          pip={pip}
          setFullResolution={setFullResolution}
          onError={onError}
        />
      );
    } else {
      player = (
        <div className="w-5xl text-center text-sm">
          {t("livePlayerRequiredIOSVersion")}
        </div>
      );
    }
  } else if (preferredLiveMode == "jsmpeg") {
    if (cameraActive || !showStillWithoutActivity || liveReady) {
      player = (
        <JSMpegPlayer
          key={`jsmpeg_${playerKey}`}
          className="flex justify-center overflow-hidden rounded-lg md:rounded-lg"
          camera={cameraConfig.name}
          width={cameraConfig.detect.width}
          height={cameraConfig.detect.height}
          playbackEnabled={
            cameraActive || !showStillWithoutActivity || liveReady
          }
          useWebGL={useWebGL}
          setStats={setStats}
          containerRef={containerRef ?? internalContainerRef}
          onPlaying={playerIsPlaying}
        />
      );
    } else {
      player = null;
    }
  } else {
    player = null;
  }

  return (
    <div
      ref={cameraRef ?? internalContainerRef}
      data-camera={cameraConfig.name}
      className={cn(
        "group relative m-2 flex w-full cursor-pointer justify-center rounded-lg outline outline-background transition-all duration-500",
        activeTracking &&
          ((showStillWithoutActivity && !liveReady) || liveReady)
          ? "outline-3 rounded-lg border-severity_alert shadow-severity_alert outline-severity_alert md:rounded-lg"
          : "outline-0",
        className,
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleTileClick}
      onAuxClick={(e) => {
        if (e.button === 1) {
          window
            .open(`${baseUrl}/camera/${cameraConfig.name}`, "_blank")
            ?.focus();
        }
      }}
    >
      {cameraEnabled &&
        ((showStillWithoutActivity && !liveReady) || liveReady) && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[30%] w-full rounded-lg bg-gradient-to-b from-black/20 to-transparent md:rounded-lg"></div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[10%] w-full rounded-lg bg-gradient-to-t from-black/20 to-transparent md:rounded-lg"></div>
          </>
        )}
      {player}

      {((showStillWithoutActivity && !liveReady) || liveReady) &&
        objects.length > 0 && (
          <div className="absolute left-0 top-2 z-40">
            <Tooltip>
              <div className="flex">
                <TooltipTrigger asChild>
                  <div className="mx-3 pb-1 text-sm text-white">
                    <Chip
                      className={`z-0 flex items-start justify-between space-x-1 bg-gray-500 bg-gradient-to-br from-gray-400 to-gray-500`}
                    >
                      {[
                        ...new Set([
                          ...(objects || []).map(({ label }) => label),
                        ]),
                      ]
                        .map((label) => {
                          return getIconForLabel(label, "size-3 text-white");
                        })
                        .sort()}
                    </Chip>
                  </div>
                </TooltipTrigger>
              </div>
              <TooltipPortal>
                <TooltipContent className="smart-capitalize">
                  {[
                    ...new Set([
                      ...(objects || []).map(({ label, sub_label }) =>
                        label.endsWith("verified")
                          ? sub_label
                          : label.replaceAll("_", " "),
                      ),
                    ]),
                  ]
                    .filter((label) => label?.includes("-verified") == false)
                    .map((label) => capitalizeFirstLetter(label))
                    .sort()
                    .join(", ")
                    .replaceAll("-verified", "")}
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          </div>
        )}

      <div
        className={cn(
          "absolute inset-0 w-full",
          showStillWithoutActivity &&
            !liveReady &&
            !isReEnabling &&
            cameraEnabled
            ? "visible"
            : "invisible",
        )}
      >
        <AutoUpdatingCameraImage
          className="pointer-events-none size-full rounded-lg md:rounded-lg"
          cameraClasses="relative size-full flex justify-center rounded-lg md:rounded-lg"
          camera={cameraConfig.name}
          showFps={false}
          reloadInterval={stillReloadInterval}
          periodicCache
        />
      </div>

      {offline && !showStillWithoutActivity && cameraEnabled && !liveReady && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center shadow-sm dark:border-red-800 dark:bg-red-950">
            <div className="text-sm font-medium text-red-800 dark:text-red-200">
              Camera Offline
            </div>
            <div className="text-xs text-red-600 dark:text-red-400">
              Check camera connection
            </div>
          </div>
        </div>
      )}
      {!cameraEnabled && (
        <div className="relative flex h-full w-full items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-900">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-center gap-2">
              <LuVideoOff className="h-4 w-4 text-gray-500" />
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Camera Disabled
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="absolute right-2 top-2 z-[100] flex items-center gap-2">
        {/* Refresh button - only show on hover and when needed */}
        {onResetLiveMode && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onResetLiveMode();
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  className="z-[101] rounded-full bg-black/80 p-1.5 text-white opacity-0 shadow-lg ring-1 ring-white/20 transition-opacity duration-200 group-hover:opacity-100 hover:bg-black"
                >
                  <LuRefreshCw className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side="left" className="z-[102]">
                  <div className="text-xs">Refresh Stream</div>
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          </TooltipProvider>
        )}

        {autoLive &&
          !offline &&
          activeMotion &&
          ((showStillWithoutActivity && !liveReady) || liveReady) && (
            <MdCircle className="z-[101] size-2 animate-pulse text-danger shadow-danger drop-shadow-md" />
          )}
        {((offline && showStillWithoutActivity) || !cameraEnabled) && (
          <Chip
            className={`z-[101] flex items-start justify-between space-x-1 bg-gray-500 bg-gradient-to-br from-gray-400 to-gray-500 text-xs capitalize shadow-lg ring-1 ring-white/20`}
          >
            {cameraName}
          </Chip>
        )}
      </div>

      {showStats && (
        <PlayerStats stats={stats} minimal={cameraRef !== undefined} />
      )}
      {videoEffects && cameraEnabled && liveReady && hasActiveVideoContent && (
        <div className="absolute bottom-2 right-2 z-[107]">
          <VideoEffectsControl
            onEffectsChange={setCurrentVideoEffects}
            disabled={!liveReady || !hasActiveVideoContent}
            initialEffects={currentVideoEffects}
          />
        </div>
      )}

      {/* Smart streaming indicator - subtle icon at top-right edge */}
      {showStillWithoutActivity && !cameraActive && cameraEnabled && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute right-2 top-2 z-[103]">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-xl ring-2 ring-white/30 backdrop-blur-sm">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-white" />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="left"
                className="z-[104] border-amber-200 bg-amber-50 text-amber-900 shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  <div>
                    <div className="text-xs font-medium">Smart Streaming</div>
                    <div className="text-xs opacity-80">
                      Paused - waiting for motion
                    </div>
                  </div>
                </div>
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Camera name tooltip - only show when no objects detected to avoid conflicts */}
      {((showStillWithoutActivity && !liveReady) || liveReady) &&
        objects.length === 0 && (
          <div className="absolute left-2 top-2 z-[105]">
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className="mx-1 pb-1 text-sm text-white">
                <div className="z-[106] flex items-center justify-center space-x-1 rounded-md bg-black/80 px-2 py-1 text-xs shadow-lg ring-1 ring-white/20 backdrop-blur-sm">
                  {cameraConfig.name.replaceAll("_", " ")}
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
