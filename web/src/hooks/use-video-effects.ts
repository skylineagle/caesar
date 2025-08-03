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

    const videoElements = containerRef.current.querySelectorAll("video");
    const playingVideos: HTMLVideoElement[] = [];

    videoElements.forEach((video) => {
      const videoEl = video as HTMLVideoElement;
      if (
        videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0 &&
        !videoEl.ended
      ) {
        playingVideos.push(videoEl);
      }
    });

    const jsmpegContainers = containerRef.current.querySelectorAll(".jsmpeg");
    const activeJsmpegCanvases: HTMLCanvasElement[] = [];
    jsmpegContainers.forEach((container) => {
      const canvas = container.querySelector("canvas");
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        activeJsmpegCanvases.push(canvas as HTMLCanvasElement);
      }
    });

    playingVideos.forEach((video) => {
      video.style.filter = filterString;
    });

    activeJsmpegCanvases.forEach((canvas) => {
      canvas.style.filter = filterString;
      canvas.style.transform = canvas.style.transform || "translateZ(0)";
    });
  }, [containerRef, effects]);

  const resetEffects = useCallback(() => {
    if (!containerRef.current) return;

    const allVideoElements = containerRef.current.querySelectorAll("video");
    allVideoElements.forEach((video) => {
      (video as HTMLVideoElement).style.filter = "";
    });

    const jsmpegContainers = containerRef.current.querySelectorAll(".jsmpeg");
    jsmpegContainers.forEach((container) => {
      const canvas = container.querySelector("canvas");
      if (canvas) {
        canvas.style.filter = "";
        canvas.style.transform = "";
      }
    });
  }, [containerRef]);

  useEffect(() => {
    if (!containerRef.current) return;

    applyEffects();

    const observer = new MutationObserver(() => {
      requestAnimationFrame(applyEffects);
    });

    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [applyEffects, containerRef]);

  return { applyEffects, resetEffects };
};

const defaultVideoEffects: VideoEffects = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
};

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

  const effects = useMemo(() => {
    return persistedEffects ?? defaultVideoEffects;
  }, [persistedEffects]);

  return {
    effects,
    updateEffects,
    resetEffects,
  };
};

export const useHasActiveVideoContent = (
  containerRef: RefObject<HTMLElement>,
) => {
  const [hasActiveContent, setHasActiveContent] = useState(false);

  const checkForActiveContent = useCallback(() => {
    if (!containerRef.current) {
      setHasActiveContent(false);
      return;
    }

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

    const jsmpegContainers = containerRef.current.querySelectorAll(".jsmpeg");
    const hasActiveJsmpeg = Array.from(jsmpegContainers).some((container) => {
      const canvas = container.querySelector("canvas");
      return canvas && canvas.width > 0 && canvas.height > 0;
    });

    setHasActiveContent(hasActiveVideos || hasActiveJsmpeg);
  }, [containerRef]);

  useEffect(() => {
    if (!containerRef.current) return;

    checkForActiveContent();

    const interval = setInterval(checkForActiveContent, 1000);

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
