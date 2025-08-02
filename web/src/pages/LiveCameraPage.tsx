import { useFullscreen } from "@/hooks/use-fullscreen";
import useKeyboardListener from "@/hooks/use-keyboard-listener";
import { FrigateConfig } from "@/types/frigateConfig";
import LiveBirdseyeView from "@/views/live/LiveBirdseyeView";
import LiveCameraView from "@/views/live/LiveCameraView";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { useParams } from "react-router-dom";

function LiveCameraPage() {
  const { t } = useTranslation(["views/live"]);
  const { data: config } = useSWR<FrigateConfig>("config");
  const { camera: cameraName } = useParams<{ camera: string }>();

  const mainRef = useRef<HTMLDivElement | null>(null);

  const { fullscreen, toggleFullscreen, supportsFullScreen } =
    useFullscreen(mainRef);

  useKeyboardListener(["f"], (key, modifiers) => {
    if (!modifiers.down) {
      return;
    }

    switch (key) {
      case "f":
        toggleFullscreen();
        break;
    }
  });

  useEffect(() => {
    if (cameraName) {
      const capitalized = cameraName
        .split("_")
        .filter((text) => text)
        .map((text) => text[0].toUpperCase() + text.substring(1));
      document.title = t("documentTitle.withCamera", {
        camera: capitalized.join(" "),
      });
    } else {
      document.title = t("documentTitle", { ns: "views/live" });
    }
  }, [cameraName, t]);

  const selectedCamera = useMemo(() => {
    if (!config || !cameraName) {
      return null;
    }

    if (cameraName === "birdseye") {
      return null;
    }

    return config.cameras[cameraName] || null;
  }, [config, cameraName]);

  if (!cameraName) {
    return null;
  }

  return (
    <div className="size-full p-1" ref={mainRef}>
      {cameraName === "birdseye" ? (
        <LiveBirdseyeView
          supportsFullscreen={supportsFullScreen}
          fullscreen={fullscreen}
          toggleFullscreen={toggleFullscreen}
        />
      ) : selectedCamera ? (
        <LiveCameraView
          config={config}
          camera={selectedCamera}
          supportsFullscreen={supportsFullScreen}
          fullscreen={fullscreen}
          toggleFullscreen={toggleFullscreen}
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground">
              Camera Not Found
            </h2>
            <p className="text-secondary-foreground">
              The camera "{cameraName}" could not be found.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default LiveCameraPage;
