import { useFullscreen } from "@/hooks/use-fullscreen";
import useKeyboardListener from "@/hooks/use-keyboard-listener";
import { FrigateConfig } from "@/types/frigateConfig";
import LiveBirdseyeView from "@/views/live/LiveBirdseyeView";
import LiveCameraView from "@/views/live/LiveCameraView";
import LiveDashboardView from "@/views/live/LiveDashboardView";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import useSWR from "swr";

function GroupView() {
  const { t } = useTranslation(["views/live"]);
  const { data: config } = useSWR<FrigateConfig>("config");
  const { group } = useParams<{ group: string }>();
  const navigate = useNavigate();
  const cameraGroup = group || "default";

  const [selectedCameraName] = useQueryState(
    "camera",
    parseAsString.withDefault("default"),
  );

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
    if (selectedCameraName) {
      const capitalized = selectedCameraName
        .split("_")
        .filter((text) => text)
        .map((text) => text[0].toUpperCase() + text.substring(1));
      document.title = t("documentTitle.withCamera", {
        camera: capitalized.join(" "),
      });
    } else if (cameraGroup && cameraGroup != "default") {
      document.title = t("documentTitle.withCamera", {
        camera: `${cameraGroup[0].toUpperCase()}${cameraGroup.substring(1)}`,
      });
    } else {
      document.title = t("documentTitle", { ns: "views/live" });
    }
  }, [cameraGroup, selectedCameraName, t]);

  const includesBirdseye = useMemo(() => {
    if (
      config &&
      Object.keys(config.camera_groups).length &&
      cameraGroup &&
      config.camera_groups[cameraGroup] &&
      cameraGroup != "default"
    ) {
      return config.camera_groups[cameraGroup].cameras.includes("birdseye");
    } else {
      return false;
    }
  }, [config, cameraGroup]);

  const cameras = useMemo(() => {
    if (!config) {
      return [];
    }

    if (
      Object.keys(config.camera_groups).length &&
      cameraGroup &&
      config.camera_groups[cameraGroup] &&
      cameraGroup != "default"
    ) {
      const group = config.camera_groups[cameraGroup];
      return Object.values(config.cameras)
        .filter(
          (conf) => conf.enabled_in_config && group.cameras.includes(conf.name),
        )
        .sort((aConf, bConf) => aConf.ui.order - bConf.ui.order);
    }

    return Object.values(config.cameras)
      .filter((conf) => conf.ui.dashboard && conf.enabled_in_config)
      .sort((aConf, bConf) => aConf.ui.order - bConf.ui.order);
  }, [config, cameraGroup]);

  const selectedCamera = useMemo(
    () => cameras.find((cam) => cam.name == selectedCameraName),
    [cameras, selectedCameraName],
  );

  const handleSelectCamera = (cameraName: string) => {
    navigate(`/camera/${cameraName}`);
  };

  return (
    <div className="size-full" ref={mainRef}>
      {selectedCameraName === "birdseye" ? (
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
        <LiveDashboardView
          cameras={cameras}
          cameraGroup={cameraGroup}
          includeBirdseye={includesBirdseye}
          onSelectCamera={handleSelectCamera}
          fullscreen={fullscreen}
          toggleFullscreen={toggleFullscreen}
        />
      )}
    </div>
  );
}

export default GroupView;
