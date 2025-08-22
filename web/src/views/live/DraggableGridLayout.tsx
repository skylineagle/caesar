import { EditGroupDialog } from "@/components/filter/CameraGroupSelector";
import LiveContextMenu from "@/components/menu/LiveContextMenu";
import BirdseyeLivePlayer from "@/components/player/BirdseyeLivePlayer";
import LivePlayer from "@/components/player/LivePlayer";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useResizeObserver } from "@/hooks/resize-observer";
import { usePersistence } from "@/hooks/use-persistence";
import { cn } from "@/lib/utils";
import {
  BirdseyeConfig,
  CameraConfig,
  CameraStreamingSettings,
  FrigateConfig,
} from "@/types/frigateConfig";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import {
  AudioState,
  LivePlayerError,
  LivePlayerMode,
  StatsState,
  VolumeState,
  StreamingPriority,
} from "@/types/live";
import { ASPECT_VERTICAL_LAYOUT, ASPECT_WIDE_LAYOUT } from "@/types/record";
import { isEqual } from "lodash";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isDesktop, isMobile } from "react-device-detect";
import {
  ItemCallback,
  Layout,
  Responsive,
  WidthProvider,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useTranslation } from "react-i18next";
import { FaCompress, FaExpand } from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { LuLayoutDashboard, LuPencil } from "react-icons/lu";
import "react-resizable/css/styles.css";
import { useParams } from "react-router-dom";

type DraggableGridLayoutProps = {
  cameras: CameraConfig[];
  cameraGroup: string;
  cameraRef: (node: HTMLElement | null) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  includeBirdseye: boolean;
  onSelectCamera: (camera: string) => void;
  windowVisible: boolean;
  visibleCameras: string[];
  isEditMode: boolean;
  setIsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  preferredLiveModes: Record<string, LivePlayerMode>;
  resetPreferredLiveMode: (camera: string) => void;
  isRestreamedStates: Record<string, boolean>;
  supportsAudioOutputStates: Record<string, { supportsAudio: boolean }>;
  audioStates: AudioState;
  volumeStates: VolumeState;
  setVolumeStates: React.Dispatch<React.SetStateAction<VolumeState>>;
  statsStates: StatsState;
  toggleAudio: (cameraName: string) => void;
  toggleStats: (cameraName: string) => void;
  muteAll: () => void;
  unmuteAll: () => void;
  handleError: (cameraName: string, error: LivePlayerError) => void;
  globalAutoLive: boolean | undefined;
  currentGroupStreamingSettings:
    | Record<string, CameraStreamingSettings>
    | undefined;
  config: FrigateConfig | undefined;
  streamingPriority: StreamingPriority;
};
export default function DraggableGridLayout({
  cameras,
  cameraGroup,
  containerRef,
  cameraRef,
  includeBirdseye,
  onSelectCamera,
  windowVisible,
  visibleCameras,
  isEditMode,
  setIsEditMode,
  fullscreen,
  toggleFullscreen,
  preferredLiveModes,
  resetPreferredLiveMode,
  isRestreamedStates,
  supportsAudioOutputStates,
  audioStates,
  volumeStates,
  setVolumeStates,
  statsStates,
  toggleAudio,
  toggleStats,
  muteAll,
  unmuteAll,
  handleError,
  globalAutoLive,
  currentGroupStreamingSettings,
  config,
  streamingPriority,
}: DraggableGridLayoutProps) {
  const { t } = useTranslation(["views/live"]);
  const birdseyeConfig = useMemo(() => config?.birdseye, [config]);

  // grid layout

  const ResponsiveGridLayout = useMemo(() => WidthProvider(Responsive), []);

  const [gridLayout, setGridLayout, isGridLayoutLoaded] = usePersistence<
    Layout[]
  >(`${cameraGroup}-draggable-layout`);

  const { group } = useParams<{ group: string }>();

  const groups = useMemo(() => {
    if (!config) {
      return [];
    }

    return Object.entries(config.camera_groups).sort(
      (a, b) => a[1].order - b[1].order,
    );
  }, [config]);

  // editing

  const [editGroup, setEditGroup] = useState(false);
  const [showCircles, setShowCircles] = useState(true);

  useEffect(() => {
    setIsEditMode(false);
    setEditGroup(false);
  }, [cameraGroup, setIsEditMode]);

  // camera state

  const [currentCameras, setCurrentCameras] = useState<CameraConfig[]>();
  const [currentIncludeBirdseye, setCurrentIncludeBirdseye] =
    useState<boolean>();
  const [currentGridLayout, setCurrentGridLayout] = useState<
    Layout[] | undefined
  >();

  const handleLayoutChange = useCallback(
    (currentLayout: Layout[]) => {
      if (!isGridLayoutLoaded || !isEqual(gridLayout, currentGridLayout)) {
        return;
      }
      // save layout to idb
      setGridLayout(currentLayout);
      setShowCircles(true);
    },
    [setGridLayout, isGridLayoutLoaded, gridLayout, currentGridLayout],
  );

  const generateLayout = useCallback(() => {
    if (!isGridLayoutLoaded) {
      return;
    }

    const cameraNames =
      includeBirdseye && birdseyeConfig?.enabled
        ? ["birdseye", ...cameras.map((camera) => camera?.name || "")]
        : cameras.map((camera) => camera?.name || "");

    const optionsMap: Layout[] = currentGridLayout
      ? currentGridLayout.filter((layout) => cameraNames?.includes(layout.i))
      : [];

    cameraNames.forEach((cameraName, index) => {
      const existingLayout = optionsMap.find(
        (layout) => layout.i === cameraName,
      );

      // Skip if the camera already exists in the layout
      if (existingLayout) {
        return;
      }

      let aspectRatio;
      let col;

      // Handle "birdseye" camera as a special case
      if (cameraName === "birdseye") {
        aspectRatio =
          (birdseyeConfig?.width || 1) / (birdseyeConfig?.height || 1);
        col = 0; // Set birdseye camera in the first column
      } else {
        const camera = cameras.find((cam) => cam.name === cameraName);
        aspectRatio =
          (camera && camera?.detect.width / camera?.detect.height) || 16 / 9;
        col = index % 3; // Regular cameras distributed across columns
      }

      // Calculate layout options based on aspect ratio
      const columnsPerPlayer = 4;
      let height;
      let width;

      if (aspectRatio < 1) {
        // Portrait
        height = 2 * columnsPerPlayer;
        width = columnsPerPlayer;
      } else if (aspectRatio > 2) {
        // Wide
        height = 1 * columnsPerPlayer;
        width = 2 * columnsPerPlayer;
      } else {
        // Landscape
        height = 1 * columnsPerPlayer;
        width = columnsPerPlayer;
      }

      const options = {
        i: cameraName,
        x: col * width,
        y: 0, // don't set y, grid does automatically
        w: width,
        h: height,
      };

      optionsMap.push(options);
    });

    return optionsMap;
  }, [
    cameras,
    isGridLayoutLoaded,
    currentGridLayout,
    includeBirdseye,
    birdseyeConfig,
  ]);

  useEffect(() => {
    if (isGridLayoutLoaded) {
      if (gridLayout) {
        // set current grid layout from loaded
        setCurrentGridLayout(gridLayout);
      } else {
        // idb is empty, set it with an initial layout
        setGridLayout(generateLayout());
      }
    }
  }, [
    isEditMode,
    gridLayout,
    currentGridLayout,
    setGridLayout,
    isGridLayoutLoaded,
    generateLayout,
  ]);

  useEffect(() => {
    if (
      !isEqual(cameras, currentCameras) ||
      includeBirdseye !== currentIncludeBirdseye
    ) {
      setCurrentCameras(cameras);
      setCurrentIncludeBirdseye(includeBirdseye);

      // set new grid layout in idb
      setGridLayout(generateLayout());
    }
  }, [
    cameras,
    includeBirdseye,
    currentCameras,
    currentIncludeBirdseye,
    setCurrentGridLayout,
    generateLayout,
    setGridLayout,
    isGridLayoutLoaded,
  ]);

  const [marginValue, setMarginValue] = useState(16);

  // calculate margin value for browsers that don't have default font size of 16px
  useLayoutEffect(() => {
    const calculateRemValue = () => {
      const htmlElement = document.documentElement;
      const fontSize = window.getComputedStyle(htmlElement).fontSize;
      setMarginValue(parseFloat(fontSize));
    };

    calculateRemValue();
  }, []);

  const gridContainerRef = useRef<HTMLDivElement>(null);

  const [{ width: containerWidth, height: containerHeight }] =
    useResizeObserver(gridContainerRef);

  const scrollBarWidth = useMemo(() => {
    if (containerWidth && containerHeight && containerRef.current) {
      return (
        containerRef.current.offsetWidth - containerRef.current.clientWidth
      );
    }
    return 0;
  }, [containerRef, containerHeight, containerWidth]);

  const availableWidth = useMemo(
    () => (scrollBarWidth ? containerWidth + scrollBarWidth : containerWidth),
    [containerWidth, scrollBarWidth],
  );

  const hasScrollbar = useMemo(() => {
    if (containerHeight && containerRef.current) {
      return (
        containerRef.current.offsetHeight < containerRef.current.scrollHeight
      );
    }
  }, [containerRef, containerHeight]);

  const cellHeight = useMemo(() => {
    const aspectRatio = 16 / 9;
    // subtract container margin, 1 camera takes up at least 4 rows
    // account for additional margin on bottom of each row
    return (
      ((availableWidth ?? window.innerWidth) - 2 * marginValue) /
        12 /
        aspectRatio -
      marginValue +
      marginValue / 4
    );
  }, [availableWidth, marginValue]);

  const handleResize: ItemCallback = (
    _: Layout[],
    oldLayoutItem: Layout,
    layoutItem: Layout,
    placeholder: Layout,
  ) => {
    const heightDiff = layoutItem.h - oldLayoutItem.h;
    const widthDiff = layoutItem.w - oldLayoutItem.w;
    const changeCoef = oldLayoutItem.w / oldLayoutItem.h;

    let newWidth, newHeight;

    if (Math.abs(heightDiff) < Math.abs(widthDiff)) {
      newHeight = Math.round(layoutItem.w / changeCoef);
      newWidth = Math.round(newHeight * changeCoef);
    } else {
      newWidth = Math.round(layoutItem.h * changeCoef);
      newHeight = Math.round(newWidth / changeCoef);
    }

    // Ensure dimensions maintain aspect ratio and fit within the grid
    if (layoutItem.x + newWidth > 12) {
      newWidth = 12 - layoutItem.x;
      newHeight = Math.round(newWidth / changeCoef);
    }

    if (changeCoef == 0.5) {
      // portrait
      newHeight = Math.ceil(newHeight / 2) * 2;
    } else if (changeCoef == 2) {
      // pano/wide
      newHeight = Math.ceil(newHeight * 2) / 2;
    }

    newWidth = Math.round(newHeight * changeCoef);

    layoutItem.w = newWidth;
    layoutItem.h = newHeight;
    placeholder.w = layoutItem.w;
    placeholder.h = layoutItem.h;
  };

  return (
    <>
      {!isGridLayoutLoaded ||
      !currentGridLayout ||
      !isEqual(cameras, currentCameras) ||
      includeBirdseye !== currentIncludeBirdseye ? (
        <div className="mt-2 grid grid-cols-2 gap-2 px-2 md:gap-4 xl:grid-cols-3 3xl:grid-cols-4">
          {includeBirdseye && birdseyeConfig?.enabled && (
            <Skeleton className="size-full rounded-lg md:rounded-2xl" />
          )}
          {cameras.map((camera) => {
            return (
              <Skeleton
                key={camera.name}
                className="aspect-video size-full rounded-lg md:rounded-2xl"
              />
            );
          })}
        </div>
      ) : (
        <div
          className="no-scrollbar relative my-2 select-none overflow-x-hidden px-2 pb-8"
          ref={gridContainerRef}
        >
          <EditGroupDialog
            open={editGroup}
            setOpen={setEditGroup}
            currentGroups={groups}
            activeGroup={group}
          />
          <ResponsiveGridLayout
            className="grid-layout"
            layouts={{
              lg: currentGridLayout,
              md: currentGridLayout,
              sm: currentGridLayout,
              xs: currentGridLayout,
              xxs: currentGridLayout,
            }}
            rowHeight={cellHeight}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
            margin={[marginValue, marginValue]}
            containerPadding={[0, isEditMode ? 6 : 3]}
            resizeHandles={isEditMode ? ["sw", "nw", "se", "ne"] : []}
            onDragStop={handleLayoutChange}
            onResize={handleResize}
            onResizeStart={() => setShowCircles(false)}
            onResizeStop={handleLayoutChange}
            isDraggable={isEditMode}
            isResizable={isEditMode}
          >
            {includeBirdseye && birdseyeConfig?.enabled && (
              <BirdseyeLivePlayerGridItem
                key="birdseye"
                className={cn(
                  isEditMode &&
                    showCircles &&
                    "outline outline-2 outline-muted-foreground hover:cursor-grab hover:outline-4 active:cursor-grabbing",
                )}
                birdseyeConfig={birdseyeConfig}
                liveMode={birdseyeConfig.restream ? "mse" : "jsmpeg"}
                onClick={() => onSelectCamera("birdseye")}
                videoEffects={true}
              >
                {isEditMode && showCircles && <CornerCircles />}
              </BirdseyeLivePlayerGridItem>
            )}
            {cameras.map((camera) => {
              let grow;
              const aspectRatio = camera.detect.width / camera.detect.height;
              if (aspectRatio > ASPECT_WIDE_LAYOUT) {
                grow = `aspect-wide w-full`;
              } else if (aspectRatio < ASPECT_VERTICAL_LAYOUT) {
                grow = `aspect-tall h-full`;
              } else {
                grow = "aspect-video";
              }
              const availableStreams = camera.live.streams || {};
              const firstStreamEntry = Object.values(availableStreams)[0] || "";

              const streamNameFromSettings =
                currentGroupStreamingSettings?.[camera.name]?.streamName || "";
              const streamExists =
                streamNameFromSettings &&
                Object.values(availableStreams).includes(
                  streamNameFromSettings,
                );

              const streamName = streamExists
                ? streamNameFromSettings
                : firstStreamEntry;
              const streamType =
                currentGroupStreamingSettings?.[camera.name]?.streamType;
              const autoLive =
                streamType !== undefined
                  ? streamType !== "no-streaming"
                  : undefined;
              const showStillWithoutActivity =
                currentGroupStreamingSettings?.[camera.name]?.streamType !==
                "continuous";
              const useWebGL =
                currentGroupStreamingSettings?.[camera.name]
                  ?.compatibilityMode || false;
              return (
                <div className={grow} key={camera.name}>
                  <GridLiveContextMenu
                    className="h-full w-full"
                    camera={camera.name}
                    streamName={streamName}
                    cameraGroup={cameraGroup}
                    preferredLiveMode={preferredLiveModes[camera.name] ?? "mse"}
                    isRestreamed={isRestreamedStates[camera.name]}
                    supportsAudio={
                      supportsAudioOutputStates[streamName]?.supportsAudio ??
                      false
                    }
                    audioState={audioStates[camera.name]}
                    toggleAudio={() => toggleAudio(camera.name)}
                    statsState={statsStates[camera.name]}
                    toggleStats={() => toggleStats(camera.name)}
                    volumeState={volumeStates[camera.name]}
                    setVolumeState={(value) =>
                      setVolumeStates({
                        [camera.name]: value,
                      })
                    }
                    muteAll={muteAll}
                    unmuteAll={unmuteAll}
                    resetPreferredLiveMode={() =>
                      resetPreferredLiveMode(camera.name)
                    }
                    config={config}
                  >
                    <TransformWrapper
                      minScale={1.0}
                      wheel={{ smoothStep: 0.005 }}
                    >
                      <TransformComponent
                        wrapperStyle={{
                          width: "100%",
                          height: "100%",
                        }}
                        contentStyle={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <LivePlayer
                          key={camera.name}
                          streamName={streamName}
                          autoLive={autoLive ?? globalAutoLive}
                          showStillWithoutActivity={
                            showStillWithoutActivity ?? false
                          }
                          useWebGL={useWebGL}
                          cameraRef={cameraRef}
                          className={cn(
                            "rounded-lg bg-black md:rounded-2xl",
                            grow,
                            isEditMode &&
                              showCircles &&
                              "outline-2 outline-muted-foreground hover:cursor-grab hover:outline-4 active:cursor-grabbing",
                          )}
                          windowVisible={
                            windowVisible &&
                            visibleCameras.includes(camera.name)
                          }
                          cameraConfig={camera}
                          preferredLiveMode={
                            preferredLiveModes[camera.name] ?? "mse"
                          }
                          playInBackground={false}
                          showStats={statsStates[camera.name]}
                          onClick={() => {
                            !isEditMode && onSelectCamera(camera.name);
                          }}
                          onError={(e) => handleError(camera.name, e)}
                          onResetLiveMode={() =>
                            resetPreferredLiveMode(camera.name)
                          }
                          playAudio={audioStates[camera.name]}
                          volume={volumeStates[camera.name]}
                          videoEffects={true}
                          streamingPriority={streamingPriority}
                          streamIndex={cameras.findIndex(
                            (c) => c.name === camera.name,
                          )}
                        />
                      </TransformComponent>
                    </TransformWrapper>
                    {isEditMode && showCircles && <CornerCircles />}
                  </GridLiveContextMenu>
                </div>
              );
            })}
          </ResponsiveGridLayout>
          {isDesktop && (
            <div
              className={cn(
                "fixed",
                isDesktop && "bottom-12 lg:bottom-9",
                isMobile && "bottom-12 lg:bottom-16",
                hasScrollbar && isDesktop ? "right-6" : "right-3",
                "z-50 flex flex-row gap-2",
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="cursor-pointer rounded-lg bg-secondary text-secondary-foreground opacity-60 transition-all duration-300 hover:bg-muted hover:opacity-100"
                    onClick={() =>
                      setIsEditMode((prevIsEditMode) => !prevIsEditMode)
                    }
                  >
                    {isEditMode ? (
                      <IoClose className="size-5 md:m-[6px]" />
                    ) : (
                      <LuLayoutDashboard className="size-5 md:m-[6px]" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {isEditMode
                    ? t("editLayout.exitEdit")
                    : t("editLayout.label")}
                </TooltipContent>
              </Tooltip>
              {!isEditMode && (
                <>
                  {!fullscreen && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="cursor-pointer rounded-lg bg-secondary text-secondary-foreground opacity-60 transition-all duration-300 hover:bg-muted hover:opacity-100"
                          onClick={() =>
                            setEditGroup((prevEditGroup) => !prevEditGroup)
                          }
                        >
                          <LuPencil className="size-5 md:m-[6px]" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isEditMode
                          ? t("editLayout.exitEdit")
                          : t("editLayout.group.label")}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="cursor-pointer rounded-lg bg-secondary text-secondary-foreground opacity-60 transition-all duration-300 hover:bg-muted hover:opacity-100"
                        onClick={toggleFullscreen}
                      >
                        {fullscreen ? (
                          <FaCompress className="size-5 md:m-[6px]" />
                        ) : (
                          <FaExpand className="size-5 md:m-[6px]" />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {fullscreen
                        ? t("button.exitFullscreen", { ns: "common" })
                        : t("button.fullscreen", { ns: "common" })}
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function CornerCircles() {
  return (
    <>
      <div className="pointer-events-none absolute left-[-4px] top-[-4px] z-50 size-3 rounded-full bg-primary-variant p-2 text-background outline-2 outline-muted" />
      <div className="pointer-events-none absolute right-[-4px] top-[-4px] z-50 size-3 rounded-full bg-primary-variant p-2 text-background outline-2 outline-muted" />
      <div className="pointer-events-none absolute bottom-[-4px] right-[-4px] z-50 size-3 rounded-full bg-primary-variant p-2 text-background outline-2 outline-muted" />
      <div className="pointer-events-none absolute bottom-[-4px] left-[-4px] z-50 size-3 rounded-full bg-primary-variant p-2 text-background outline-2 outline-muted" />
    </>
  );
}

type BirdseyeLivePlayerGridItemProps = {
  style?: React.CSSProperties;
  className?: string;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
  children?: React.ReactNode;
  birdseyeConfig: BirdseyeConfig;
  liveMode: LivePlayerMode;
  onClick: () => void;
  videoEffects?: boolean;
};

const BirdseyeLivePlayerGridItem = React.forwardRef<
  HTMLDivElement,
  BirdseyeLivePlayerGridItemProps
>(
  (
    {
      style,
      className,
      onMouseDown,
      onMouseUp,
      onTouchEnd,
      children,
      birdseyeConfig,
      liveMode,
      onClick,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        style={{ ...style }}
        ref={ref}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onTouchEnd={onTouchEnd}
        {...props}
      >
        <BirdseyeLivePlayer
          className={className}
          birdseyeConfig={birdseyeConfig}
          liveMode={liveMode}
          onClick={onClick}
          containerRef={ref as React.RefObject<HTMLDivElement>}
        />
        {children}
      </div>
    );
  },
);

type GridLiveContextMenuProps = {
  className?: string;
  style?: React.CSSProperties;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
  children?: React.ReactNode;
  camera: string;
  streamName: string;
  cameraGroup: string;
  preferredLiveMode: string;
  isRestreamed: boolean;
  supportsAudio: boolean;
  audioState: boolean;
  toggleAudio: () => void;
  statsState: boolean;
  toggleStats: () => void;
  volumeState?: number;
  setVolumeState: (volumeState: number) => void;
  muteAll: () => void;
  unmuteAll: () => void;
  resetPreferredLiveMode: () => void;
  config?: FrigateConfig;
};

const GridLiveContextMenu = React.forwardRef<
  HTMLDivElement,
  GridLiveContextMenuProps
>(
  (
    {
      className,
      style,
      onMouseDown,
      onMouseUp,
      onTouchEnd,
      children,
      camera,
      streamName,
      cameraGroup,
      preferredLiveMode,
      isRestreamed,
      supportsAudio,
      audioState,
      toggleAudio,
      statsState,
      toggleStats,
      volumeState,
      setVolumeState,
      muteAll,
      unmuteAll,
      resetPreferredLiveMode,
      config,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        style={{ ...style }}
        ref={ref}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onTouchEnd={onTouchEnd}
        {...props}
      >
        <LiveContextMenu
          className={className}
          camera={camera}
          streamName={streamName}
          cameraGroup={cameraGroup}
          preferredLiveMode={preferredLiveMode}
          isRestreamed={isRestreamed}
          supportsAudio={supportsAudio}
          audioState={audioState}
          toggleAudio={toggleAudio}
          statsState={statsState}
          toggleStats={toggleStats}
          volumeState={volumeState}
          setVolumeState={setVolumeState}
          muteAll={muteAll}
          unmuteAll={unmuteAll}
          resetPreferredLiveMode={resetPreferredLiveMode}
          config={config}
        >
          {children}
        </LiveContextMenu>
      </div>
    );
  },
);
