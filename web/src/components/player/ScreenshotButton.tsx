import { captureScreenshot, getScreenshotFilename } from "@/utils/screenshot";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { LuCamera } from "react-icons/lu";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type ScreenshotButtonProps = {
  videoElement: HTMLVideoElement | HTMLCanvasElement | null;
  cameraName: string;
  timestamp?: number;
  className?: string;
};

export const ScreenshotButton = ({
  videoElement,
  cameraName,
  timestamp,
  className,
}: ScreenshotButtonProps) => {
  const { t } = useTranslation(["components/player"]);

  const handleScreenshot = useCallback(async () => {
    if (!videoElement) {
      toast.error(t("screenshot.error.noVideoElement"));
      return;
    }

    try {
      const filename = getScreenshotFilename(cameraName, timestamp);
      await captureScreenshot(videoElement, filename);
      toast.success(t("screenshot.success.captured"));
    } catch (error) {
      toast.error(t("screenshot.error.failed"));
    }
  }, [videoElement, cameraName, timestamp, t]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={`cursor-pointer ${className || "size-5"}`}
          onClick={handleScreenshot}
          aria-label={t("screenshot.button.aria")}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleScreenshot();
            }
          }}
        >
          <LuCamera className="size-5" />
        </button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{t("screenshot.button.tooltip")}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
};
