import { useCallback, useEffect, useMemo, useState, RefObject } from "react";
import { VideoEffects } from "@/components/player/VideoEffectsControl";
import { usePersistence } from "@/hooks/use-persistence";

export const useVideoEffects = (
  videoRef: RefObject<HTMLVideoElement>,
  effects: VideoEffects,
) => {
  const applyEffects = useCallback(() => {
    if (!videoRef.current) return;

    const filterString = [
      `brightness(${effects.brightness}%)`,
      `contrast(${effects.contrast}%)`,
      `saturate(${effects.saturation}%)`,
      `hue-rotate(${effects.hue}deg)`,
      effects.blur > 0 ? `blur(${effects.blur}px)` : "",
    ]
      .filter(Boolean)
      .join(" ");

    videoRef.current.style.filter = filterString;
  }, [videoRef, effects]);

  const resetEffects = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.style.filter = "";
  }, [videoRef]);

  useEffect(() => {
    applyEffects();
  }, [applyEffects]);

  return { applyEffects, resetEffects };
};

export const useContainerVideoEffects = (
  containerRef: RefObject<HTMLElement>,
  effects: VideoEffects,
) => {
  const applyEffects = useCallback(() => {
    if (!containerRef.current) return;

    const filterString = [
      `brightness(${effects.brightness}%)`,
      `contrast(${effects.contrast}%)`,
      `saturate(${effects.saturation}%)`,
      `hue-rotate(${effects.hue}deg)`,
      effects.blur > 0 ? `blur(${effects.blur}px)` : "",
    ]
      .filter(Boolean)
      .join(" ");

    // Find video elements that are actually playing (not still images)
    const videoElements = containerRef.current.querySelectorAll("video");
    const playingVideos: HTMLVideoElement[] = [];

    videoElements.forEach((video) => {
      const videoEl = video as HTMLVideoElement;
      // Only apply effects to videos that have loaded data (not just still images)
      // Check if video has actual content loaded and is not just a placeholder
      if (
        videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0 &&
        !videoEl.ended
      ) {
        playingVideos.push(videoEl);
      }
    });

    // Special handling for JSMpeg canvases (these are always "playing" when visible)
    const jsmpegContainers = containerRef.current.querySelectorAll(".jsmpeg");
    const activeJsmpegCanvases: HTMLCanvasElement[] = [];
    jsmpegContainers.forEach((container) => {
      const canvas = container.querySelector("canvas");
      // Only apply to JSMpeg canvases that have content (width/height > 0)
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        activeJsmpegCanvases.push(canvas as HTMLCanvasElement);
      }
    });

    // Apply effects only to playing videos
    playingVideos.forEach((video) => {
      video.style.filter = filterString;
    });

    // Apply effects to active JSMpeg canvases
    activeJsmpegCanvases.forEach((canvas) => {
      canvas.style.filter = filterString;
      // Force canvas to redraw by updating a CSS property
      canvas.style.transform = canvas.style.transform || "translateZ(0)";
    });
  }, [containerRef, effects]);

  const resetEffects = useCallback(() => {
    if (!containerRef.current) return;

    // Reset all video elements (both playing and paused)
    const allVideoElements = containerRef.current.querySelectorAll("video");
    allVideoElements.forEach((video) => {
      (video as HTMLVideoElement).style.filter = "";
    });

    // Reset all JSMpeg canvases
    const jsmpegContainers = containerRef.current.querySelectorAll(".jsmpeg");
    jsmpegContainers.forEach((container) => {
      const canvas = container.querySelector("canvas");
      if (canvas) {
        canvas.style.filter = "";
        canvas.style.transform = "";
      }
    });
  }, [containerRef]);

  // Single useEffect to handle all video effects application
  useEffect(() => {
    if (!containerRef.current) return;

    // Apply effects immediately
    applyEffects();

    // Set up interval for JSMpeg canvas elements that might update dynamically
    const interval = setInterval(applyEffects, 1000);

    // Set up mutation observer to detect new video/canvas elements
    const observer = new MutationObserver(() => {
      // Use requestAnimationFrame for better performance than setTimeout
      requestAnimationFrame(applyEffects);
    });

    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
    });

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [applyEffects, containerRef]); // Watch both applyEffects and containerRef for changes

  return { applyEffects, resetEffects };
};

// Default effects - using const to ensure stable reference
const defaultVideoEffects: VideoEffects = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
};

// Hook for persisting video effects per camera
export const usePersistedVideoEffects = (cameraName: string) => {
  const [persistedEffects, setPersistedEffects] = usePersistence<VideoEffects>(
    `camera-video-effects-${cameraName}`,
    defaultVideoEffects,
  );

  const updateEffects = useCallback(
    (newEffects: VideoEffects) => {
      setPersistedEffects(newEffects);
    },
    [setPersistedEffects],
  );

  const resetEffects = useCallback(() => {
    setPersistedEffects(defaultVideoEffects);
  }, [setPersistedEffects]);

  // Use stable reference for effects to prevent unnecessary re-renders
  const effects = useMemo(() => {
    return persistedEffects ?? defaultVideoEffects;
  }, [persistedEffects]);

  return {
    effects,
    updateEffects,
    resetEffects,
  };
};

// Hook to check if there are any video elements that can be affected
export const useHasActiveVideoContent = (
  containerRef: RefObject<HTMLElement>,
) => {
  const [hasActiveContent, setHasActiveContent] = useState(false);

  const checkForActiveContent = useCallback(() => {
    if (!containerRef.current) {
      setHasActiveContent(false);
      return;
    }

    // Check for video elements with content
    const videoElements = containerRef.current.querySelectorAll("video");
    const hasActiveVideos = Array.from(videoElements).some((video) => {
      const videoEl = video as HTMLVideoElement;
      return (
        videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0 &&
        !videoEl.ended
      );
    });

    // Check for JSMpeg canvases with content
    const jsmpegContainers = containerRef.current.querySelectorAll(".jsmpeg");
    const hasActiveJsmpeg = Array.from(jsmpegContainers).some((container) => {
      const canvas = container.querySelector("canvas");
      return canvas && canvas.width > 0 && canvas.height > 0;
    });

    setHasActiveContent(hasActiveVideos || hasActiveJsmpeg);
  }, [containerRef]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Check immediately
    checkForActiveContent();

    // Set up interval to periodically check for content
    const interval = setInterval(checkForActiveContent, 1000);

    // Set up mutation observer to detect when video/canvas elements are added or changed
    const observer = new MutationObserver(() => {
      requestAnimationFrame(checkForActiveContent);
    });

    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["width", "height"],
    });

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [checkForActiveContent, containerRef]);

  return hasActiveContent;
};
