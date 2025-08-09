import { cn } from "@/lib/utils";
import { FrigateConfig } from "@/types/frigateConfig";
import { ASPECT_VERTICAL_LAYOUT, ASPECT_WIDE_LAYOUT } from "@/types/record";
import DynamicVideoPlayer from "@/components/player/dynamic/DynamicVideoPlayer";
import { DynamicVideoController } from "@/components/player/dynamic/DynamicVideoController";
import { Preview } from "@/types/preview";
import { TimeRange } from "@/types/timeline";
import { useResizeObserver } from "@/hooks/resize-observer";
import { usePersistence } from "@/hooks/use-persistence";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { isEqual } from "lodash";
import {
  Responsive,
  WidthProvider,
  Layout,
  ItemCallback,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

type RecordingDraggableGridLayoutProps = {
  cameras: string[];
  mainCamera: string;
  timeRange: TimeRange;
  startTimestamp: number;
  isScrubbing: boolean;
  cameraPreviews?: Preview[];
  onSelectCamera: (cameraName: string) => void;
  setControllerForCamera: (
    cameraName: string,
    controller: DynamicVideoController,
  ) => void;
};

export default function RecordingDraggableGridLayout({
  cameras,
  mainCamera,
  timeRange,
  startTimestamp,
  isScrubbing,
  cameraPreviews = [],
  onSelectCamera,
  setControllerForCamera,
}: RecordingDraggableGridLayoutProps) {
  const { data: config } = useSWR<FrigateConfig>("config");

  const ResponsiveGridLayout = useMemo(() => WidthProvider(Responsive), []);

  const [gridLayout, setGridLayout, isGridLayoutLoaded] = usePersistence<
    Layout[]
  >(`recording-draggable-layout`);

  const [currentGridLayout, setCurrentGridLayout] = useState<
    Layout[] | undefined
  >();
  const [currentCameras, setCurrentCameras] = useState<string[]>();
  const [isEditMode, setIsEditMode] = useState(false);

  const generateLayout = useMemo(() => {
    return () => {
      const optionsMap: Layout[] = currentGridLayout
        ? currentGridLayout.filter((layout) => cameras?.includes(layout.i))
        : [];

      cameras.forEach((cameraName, index) => {
        const exists = optionsMap.find((l) => l.i === cameraName);
        if (exists) return;

        let aspectRatio = 16 / 9;
        if (config?.cameras[cameraName]) {
          const cam = config.cameras[cameraName];
          aspectRatio = cam.detect.width / cam.detect.height;
        }

        const columnsPerPlayer = 4;
        let h;
        let w;
        if (aspectRatio < 1) {
          h = 2 * columnsPerPlayer;
          w = columnsPerPlayer;
        } else if (aspectRatio > 2) {
          h = 1 * columnsPerPlayer;
          w = 2 * columnsPerPlayer;
        } else {
          h = 1 * columnsPerPlayer;
          w = columnsPerPlayer;
        }

        const col = index % 3;
        optionsMap.push({ i: cameraName, x: col * w, y: 0, w, h });
      });

      return optionsMap;
    };
  }, [cameras, currentGridLayout, config]);

  useEffect(() => {
    if (!isGridLayoutLoaded) return;
    if (gridLayout) {
      setCurrentGridLayout(gridLayout);
    } else {
      setGridLayout(generateLayout());
    }
  }, [isGridLayoutLoaded, gridLayout, setGridLayout, generateLayout]);

  useEffect(() => {
    if (!isEqual(cameras, currentCameras)) {
      setCurrentCameras(cameras);
      setGridLayout(generateLayout());
    }
  }, [cameras, currentCameras, setGridLayout, generateLayout]);

  const [marginValue, setMarginValue] = useState(16);
  useLayoutEffect(() => {
    const htmlElement = document.documentElement;
    const fontSize = window.getComputedStyle(htmlElement).fontSize;
    setMarginValue(parseFloat(fontSize));
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [{ width: containerWidth }] = useResizeObserver(containerRef);

  const cellHeight = useMemo(() => {
    const aspectRatio = 16 / 9;
    return (
      ((containerWidth ?? window.innerWidth) - 2 * marginValue) /
        12 /
        aspectRatio -
      marginValue +
      marginValue / 4
    );
  }, [containerWidth, marginValue]);

  const handleResize: ItemCallback = (
    _: Layout[],
    oldLayoutItem: Layout,
    layoutItem: Layout,
    placeholder: Layout,
  ) => {
    const heightDiff = layoutItem.h - oldLayoutItem.h;
    const widthDiff = layoutItem.w - oldLayoutItem.w;
    const changeCoef = oldLayoutItem.w / oldLayoutItem.h;

    let newWidth: number;
    let newHeight: number;
    if (Math.abs(heightDiff) < Math.abs(widthDiff)) {
      newHeight = Math.round(layoutItem.w / changeCoef);
      newWidth = Math.round(newHeight * changeCoef);
    } else {
      newWidth = Math.round(layoutItem.h * changeCoef);
      newHeight = Math.round(newWidth / changeCoef);
    }

    if (layoutItem.x + newWidth > 12) {
      newWidth = 12 - layoutItem.x;
      newHeight = Math.round(newWidth / changeCoef);
    }

    if (changeCoef == 0.5) {
      newHeight = Math.ceil(newHeight / 2) * 2;
    } else if (changeCoef == 2) {
      newHeight = Math.ceil(newHeight * 2) / 2;
    }

    newWidth = Math.round(newHeight * changeCoef);
    layoutItem.w = newWidth;
    layoutItem.h = newHeight;
    placeholder.w = layoutItem.w;
    placeholder.h = layoutItem.h;
  };

  const [showOutline, setShowOutline] = useState(true);

  const handleLayoutChange = (currentLayout: Layout[]) => {
    if (!isGridLayoutLoaded || !isEqual(gridLayout, currentGridLayout)) return;
    setGridLayout(currentLayout);
    setShowOutline(true);
  };

  return (
    <div
      className="no-scrollbar relative my-2 select-none overflow-x-hidden px-2 pb-8"
      ref={containerRef}
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className={cn(
            "rounded-md border px-2 py-1 text-xs",
            isEditMode
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
          )}
          onClick={() => setIsEditMode((v) => !v)}
          aria-label="Toggle edit layout"
        >
          {isEditMode ? "Done" : "Edit layout"}
        </button>
      </div>
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
        onResizeStart={() => setShowOutline(false)}
        onResizeStop={handleLayoutChange}
        isDraggable={isEditMode}
        isResizable={isEditMode}
      >
        {cameras.map((cameraName) => {
          let grow;
          let aspectRatio = 16 / 9;
          if (config?.cameras[cameraName]) {
            const cam = config.cameras[cameraName];
            aspectRatio = cam.detect.width / cam.detect.height;
          }
          if (aspectRatio > ASPECT_WIDE_LAYOUT) {
            grow = "aspect-wide w-full";
          } else if (aspectRatio < ASPECT_VERTICAL_LAYOUT) {
            grow = "aspect-tall h-full";
          } else {
            grow = "aspect-video";
          }

          return (
            <div
              key={cameraName}
              className={cn(
                isEditMode &&
                  showOutline &&
                  "outline outline-2 outline-muted-foreground hover:cursor-grab hover:outline-4 active:cursor-grabbing",
              )}
            >
              <div
                className={cn(
                  "relative",
                  cameraName === mainCamera && "ring-2 ring-primary",
                )}
                onClick={() => onSelectCamera(cameraName)}
                role="button"
                tabIndex={0}
                aria-label={`Select ${cameraName}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    onSelectCamera(cameraName);
                }}
              >
                <DynamicVideoPlayer
                  className={grow}
                  camera={cameraName}
                  timeRange={timeRange}
                  cameraPreviews={cameraPreviews}
                  startTimestamp={startTimestamp}
                  hotKeys={false}
                  fullscreen={false}
                  onTimestampUpdate={() => {}}
                  onControllerReady={(controller) => {
                    setControllerForCamera(cameraName, controller);
                    controller.seekToTimestamp(startTimestamp, true);
                  }}
                  isScrubbing={isScrubbing}
                  supportsFullscreen={false}
                  toggleFullscreen={undefined}
                  containerRef={undefined}
                  enableScreenshot={false}
                />
              </div>
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
}
