import { useCallback, useEffect, useRef } from "react";

type TransformWrapperRef = {
  state: {
    scale: number;
  };
  zoomToElement: (scale: number) => void;
};

type UseSmartScrollProps = {
  transformRefs: React.MutableRefObject<TransformWrapperRef[]>;
  scrollContainer?: HTMLElement | null;
};

export const useSmartScroll = ({
  transformRefs,
  scrollContainer,
}: UseSmartScrollProps) => {
  const isZoomingOut = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleWheel = useCallback(
    (event: Event) => {
      const wheelEvent = event as WheelEvent;
      if (wheelEvent.deltaY <= 0) {
        return;
      }

      const hasZoomedCamera = transformRefs.current.some(
        (ref) => ref?.state?.scale && ref.state.scale > 1.0,
      );

      if (hasZoomedCamera && !isZoomingOut.current) {
        event.preventDefault();
        isZoomingOut.current = true;

        transformRefs.current.forEach((ref) => {
          if (ref?.state?.scale && ref.state.scale > 1.0) {
            ref.zoomToElement(1.0);
          }
        });

        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        scrollTimeoutRef.current = setTimeout(() => {
          isZoomingOut.current = false;
        }, 300);
      }
    },
    [transformRefs],
  );

  useEffect(() => {
    const targetElement = scrollContainer || document;

    targetElement.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      targetElement.removeEventListener("wheel", handleWheel);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleWheel, scrollContainer]);
};
