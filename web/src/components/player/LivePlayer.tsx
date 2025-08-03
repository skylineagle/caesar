import { baseUrl } from "@/api/baseUrl";
import { VideoEffectsControl } from "@/components/player/VideoEffectsControl";
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
import { Trans, useTranslation } from "react-i18next";
import { LuVideoOff } from "react-icons/lu";
import { MdCircle } from "react-icons/md";
import { TbExclamationCircle } from "react-icons/tb";
import AutoUpdatingCameraImage from "../camera/AutoUpdatingCameraImage";
import ActivityIndicator from "../indicators/activity-indicator";
import Chip from "../indicators/Chip";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
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
  micEnabled?: boolean; // only webrtc supports mic
  iOSCompatFullScreen?: boolean;
  pip?: boolean;
  autoLive?: boolean;
  showStats?: boolean;
  onClick?: () => void;
  setFullResolution?: React.Dispatch<React.SetStateAction<VideoResolutionType>>;
  onError?: (error: LivePlayerError) => void;
  onResetLiveMode?: () => void;
  videoEffects?: boolean;
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
}: LivePlayerProps) {
  const { t } = useTranslation(["common", "components/player"]);

  const internalContainerRef = useRef<HTMLDivElement | null>(null);

  const cameraName = useCameraFriendlyName(cameraConfig);
  // stats

  // player state
  const [liveReady, setLiveReady] = useState(false);
  const [stats, setStats] = useState<PlayerStatsType>({
    streamType: "-",
    bandwidth: 0, // in kbps
    latency: undefined, // in seconds
    totalFrames: 0,
    droppedFrames: undefined,
    decodedFrames: 0,
    droppedFrameRate: 0, // percentage
  });

  // video effects state with persistence
  const {
    effects: currentVideoEffects,
    updateEffects: setCurrentVideoEffects,
  } = usePersistedVideoEffects(cameraConfig.name);

  // Apply video effects to any video/canvas elements in the container
  useContainerVideoEffects(internalContainerRef, currentVideoEffects);

  // Check if there's active video content that can be affected by video effects
  const hasActiveVideoContent = useHasActiveVideoContent(internalContainerRef);

  // camera activity

  const {
    enabled: cameraEnabled,
    activeMotion,
    activeTracking,
    objects,
    offline,
  } = useCameraActivity(cameraConfig);

  const cameraActive = useMemo(
    () =>
      !showStillWithoutActivity ||
      (windowVisible && (activeMotion || activeTracking)),
    [activeMotion, activeTracking, showStillWithoutActivity, windowVisible],
  );

  // camera live state

  const liveReadyRef = useRef(liveReady);
  const cameraActiveRef = useRef(cameraActive);

  useEffect(() => {
    liveReadyRef.current = liveReady;
    cameraActiveRef.current = cameraActive;
  }, [liveReady, cameraActive]);

  useEffect(() => {
    if (!autoLive || !liveReady) {
      return;
    }

    if (!cameraActive) {
      const timer = setTimeout(() => {
        if (liveReadyRef.current && !cameraActiveRef.current) {
          setLiveReady(false);
          onResetLiveMode?.();
        }
      }, 500);

      return () => {
        clearTimeout(timer);
      };
    }
    // live mode won't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLive, cameraActive, liveReady]);

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
        return 200;
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

  const [key, setKey] = useState(0);

  const resetPlayer = () => {
    setLiveReady(false);
    setKey((prevKey) => prevKey + 1);
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

  // enabled states

  const [isReEnabling, setIsReEnabling] = useState(false);
  const prevCameraEnabledRef = useRef(cameraEnabled ?? true);

  useEffect(() => {
    if (cameraEnabled == undefined) {
      return;
    }
    if (!prevCameraEnabledRef.current && cameraEnabled) {
      // Camera enabled
      setLiveReady(false);
      setIsReEnabling(true);
      setKey((prevKey) => prevKey + 1);
    } else if (prevCameraEnabledRef.current && !cameraEnabled) {
      // Camera disabled
      setLiveReady(false);
      setKey((prevKey) => prevKey + 1);
    }
    prevCameraEnabledRef.current = cameraEnabled;
  }, [cameraEnabled]);

  useEffect(() => {
    if (liveReady && isReEnabling) {
      setIsReEnabling(false);
    }
  }, [liveReady, isReEnabling]);

  if (!cameraConfig) {
    return <ActivityIndicator />;
  }

  let player;
  if (!autoLive || !streamName || !cameraEnabled) {
    player = null;
  } else if (preferredLiveMode == "webrtc") {
    player = (
      <WebRtcPlayer
        key={"webrtc_" + key}
        className={`size-full rounded-lg md:rounded-2xl ${liveReady ? "" : "hidden"}`}
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
      />
    );
  } else if (preferredLiveMode == "mse") {
    if ("MediaSource" in window || "ManagedMediaSource" in window) {
      player = (
        <MSEPlayer
          key={"mse_" + key}
          className={`size-full rounded-lg md:rounded-2xl ${liveReady ? "" : "hidden"}`}
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
          key={"jsmpeg_" + key}
          className="flex justify-center overflow-hidden rounded-lg md:rounded-2xl"
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
    player = <ActivityIndicator />;
  }

  return (
    <div
      ref={cameraRef ?? internalContainerRef}
      data-camera={cameraConfig.name}
      className={cn(
        "group relative flex w-full cursor-pointer justify-center rounded-lg",
        "transition-all duration-500",
        className,
      )}
      onClick={onClick}
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
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[30%] w-full rounded-lg bg-gradient-to-b from-black/20 to-transparent md:rounded-2xl"></div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[10%] w-full rounded-lg bg-gradient-to-t from-black/20 to-transparent md:rounded-2xl"></div>
          </>
        )}
      {player}
      {cameraEnabled &&
        !offline &&
        (!showStillWithoutActivity || isReEnabling) &&
        !liveReady && <ActivityIndicator />}

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
          className="pointer-events-none size-full rounded-lg md:rounded-2xl"
          cameraClasses="relative size-full flex justify-center rounded-lg md:rounded-2xl"
          camera={cameraConfig.name}
          showFps={false}
          reloadInterval={stillReloadInterval}
          periodicCache
        />
      </div>

      {offline && !showStillWithoutActivity && cameraEnabled && (
        <div className="absolute inset-0 left-1/2 top-1/2 flex h-96 w-96 -translate-x-1/2 -translate-y-1/2">
          <div className="flex flex-col items-center justify-center rounded-lg bg-background/50 p-5">
            <p className="my-5 text-lg">{t("streamOffline.title")}</p>
            <TbExclamationCircle className="mb-3 size-10" />
            <p className="max-w-96 text-center">
              <Trans
                ns="components/player"
                values={{
                  cameraName: cameraName,
                }}
              >
                streamOffline.desc
              </Trans>
            </p>
          </div>
        </div>
      )}

      {!cameraEnabled && (
        <div className="relative flex h-full w-full items-center justify-center rounded-2xl border border-secondary-foreground bg-background_alt">
          <div className="flex h-32 flex-col items-center justify-center rounded-lg p-4 md:h-48 md:w-48">
            <LuVideoOff className="mb-2 size-8 md:size-10" />
            <p className="max-w-32 text-center text-sm md:max-w-40 md:text-base">
              {t("cameraDisabled")}
            </p>
          </div>
        </div>
      )}

      <div className="absolute right-2 top-2">
        {autoLive &&
          !offline &&
          activeMotion &&
          ((showStillWithoutActivity && !liveReady) || liveReady) && (
            <MdCircle className="mr-2 size-2 animate-pulse text-danger shadow-danger drop-shadow-md" />
          )}
        {((offline && showStillWithoutActivity) || !cameraEnabled) && (
          <Chip
            className={`z-0 flex items-start justify-between space-x-1 bg-gray-500 bg-gradient-to-br from-gray-400 to-gray-500 text-xs capitalize`}
          >
            {cameraName}
          </Chip>
        )}
      </div>

      {showStats && (
        <PlayerStats stats={stats} minimal={cameraRef !== undefined} />
      )}
      {videoEffects && cameraEnabled && liveReady && hasActiveVideoContent && (
        <VideoEffectsControl
          onEffectsChange={setCurrentVideoEffects}
          disabled={!liveReady}
          initialEffects={currentVideoEffects}
        />
      )}
    </div>
  );
}
