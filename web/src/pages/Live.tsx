import { useFullscreen } from "@/hooks/use-fullscreen";
import useKeyboardListener from "@/hooks/use-keyboard-listener";
import { FrigateConfig } from "@/types/frigateConfig";
import LiveDashboardView from "@/views/live/LiveDashboardView";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";

function Live() {
  const { t } = useTranslation(["views/live"]);
  const { data: config } = useSWR<FrigateConfig>("config");
  const navigate = useNavigate();

  const mainRef = useRef<HTMLDivElement | null>(null);

  const { fullscreen, toggleFullscreen } = useFullscreen(mainRef);

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
    document.title = t("documentTitle", { ns: "views/live" });
  }, [t]);

  const cameras = useMemo(() => {
    if (!config) {
      return [];
    }

    return Object.values(config.cameras)
      .filter((conf) => conf.ui.dashboard && conf.enabled_in_config)
      .sort((aConf, bConf) => aConf.ui.order - bConf.ui.order);
  }, [config]);

  const includesBirdseye = useMemo(() => {
    if (!config) {
      return false;
    }

    return Object.values(config.cameras)
      .filter((conf) => conf.ui.dashboard && conf.enabled_in_config)
      .some((conf) => conf.name === "birdseye");
  }, [config]);

  const handleSelectCamera = (cameraName: string) => {
    navigate(`/camera/${cameraName}`);
  };

  return (
    <div className="size-full" ref={mainRef}>
      <LiveDashboardView
        cameras={cameras}
        cameraGroup="default"
        includeBirdseye={includesBirdseye}
        onSelectCamera={handleSelectCamera}
        fullscreen={fullscreen}
        toggleFullscreen={toggleFullscreen}
      />
    </div>
  );
}

export default Live;
