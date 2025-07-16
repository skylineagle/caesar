import { useCallback, useEffect, RefObject } from "react";
import { VideoEffects } from "@/components/player/VideoEffectsControl";

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
    const canvasElements = containerRef.current.querySelectorAll("canvas");

    videoElements.forEach((video) => {
      video.style.filter = filterString;
    });

    canvasElements.forEach((canvas) => {
      canvas.style.filter = filterString;
    });
  }, [containerRef, effects]);

  const resetEffects = useCallback(() => {
    if (!containerRef.current) return;

    const videoElements = containerRef.current.querySelectorAll("video");
    const canvasElements = containerRef.current.querySelectorAll("canvas");

    videoElements.forEach((video) => {
      video.style.filter = "";
    });

    canvasElements.forEach((canvas) => {
      canvas.style.filter = "";
    });
  }, [containerRef]);

  useEffect(() => {
    applyEffects();
  }, [applyEffects]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new MutationObserver(() => {
      applyEffects();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [containerRef, applyEffects]);

  return { applyEffects, resetEffects };
};
