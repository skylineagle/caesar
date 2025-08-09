import { useApiHost } from "@/api";
import { baseUrl } from "@/api/baseUrl";
import { useCameraPreviews } from "@/hooks/use-camera-previews";
import { usePersistence } from "@/hooks/use-persistence";
import { cn } from "@/lib/utils";
import { FrigateConfig } from "@/types/frigateConfig";
import { REVIEW_PADDING, ReviewSegment } from "@/types/review";
import { isCurrentHour } from "@/utils/dateUtil";
import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isDesktop, isSafari } from "react-device-detect";
import { useTranslation } from "react-i18next";
import { FaCircleCheck } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";
import TimeAgo from "../dynamic/TimeAgo";
import { VideoPreview } from "../preview/ScrubbablePreview";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type AnimatedEventCardProps = {
  event: ReviewSegment;
  selectedGroup?: string;
  updateEvents: () => void;
};
export function AnimatedEventCard({
  event,
  selectedGroup,
  updateEvents,
}: AnimatedEventCardProps) {
  const { t } = useTranslation(["views/events"]);
  const { data: config } = useSWR<FrigateConfig>("config");
  const apiHost = useApiHost();

  const currentHour = useMemo(() => isCurrentHour(event.start_time), [event]);

  const initialTimeRange = useMemo(() => {
    return {
      after: Math.round(event.start_time),
      before: Math.round(event.end_time || event.start_time + 20),
    };
  }, [event]);

  // preview

  const previews = useCameraPreviews(initialTimeRange, {
    camera: event.camera,
    fetchPreviews: !currentHour,
  });

  // visibility

  const [windowVisible, setWindowVisible] = useState(true);
  const visibilityListener = useCallback(() => {
    setWindowVisible(document.visibilityState == "visible");
  }, []);

  useEffect(() => {
    addEventListener("visibilitychange", visibilityListener);

    return () => {
      removeEventListener("visibilitychange", visibilityListener);
    };
  }, [visibilityListener]);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // interaction

  const navigate = useNavigate();
  const onOpenReview = useCallback(() => {
    const params = new URLSearchParams();
    params.set(
      "recording",
      JSON.stringify({
        camera: event.camera,
        startTime: event.start_time - REVIEW_PADDING,
        severity: event.severity,
      }),
    );

    // Add date parameter for better time range handling
    const eventDate = new Date(event.start_time * 1000);
    const dateString = eventDate.toISOString().split("T")[0]; // YYYY-MM-DD format
    params.set("date", dateString);

    if (selectedGroup && selectedGroup != "default") {
      params.set("group", selectedGroup);
    }

    navigate(`review?${params.toString()}`);
    axios.post(`reviews/viewed`, { ids: [event.id] });
  }, [navigate, selectedGroup, event]);

  // image behavior

  const [alertVideos] = usePersistence("alertVideos", true);

  const aspectRatio = useMemo(() => {
    if (
      !config ||
      !alertVideos ||
      !Object.keys(config.cameras).includes(event.camera)
    ) {
      return 16 / 9;
    }

    const detect = config.cameras[event.camera].detect;
    return detect.width / detect.height;
  }, [alertVideos, config, event]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="relative h-24 flex-shrink-0 overflow-hidden rounded md:rounded-lg 4k:h-32"
          style={{
            aspectRatio: alertVideos ? aspectRatio : undefined,
          }}
          onMouseEnter={isDesktop ? () => setIsHovered(true) : undefined}
          onMouseLeave={isDesktop ? () => setIsHovered(false) : undefined}
        >
          {isHovered && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="absolute right-2 top-1 z-40 bg-gray-500 bg-gradient-to-br from-gray-400 to-gray-500"
                  size="xs"
                  aria-label={t("markAsReviewed")}
                  onClick={async () => {
                    await axios.post(`reviews/viewed`, { ids: [event.id] });
                    updateEvents();
                  }}
                >
                  <FaCircleCheck className="size-3 text-white" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("markAsReviewed")}</TooltipContent>
            </Tooltip>
          )}
          {previews != undefined && (
            <div
              className="size-full cursor-pointer"
              onClick={onOpenReview}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  const params = new URLSearchParams();
                  params.set(
                    "recording",
                    JSON.stringify({
                      camera: event.camera,
                      startTime: event.start_time - REVIEW_PADDING,
                      severity: event.severity,
                    }),
                  );
                  const day = new Date(event.start_time * 1000);
                  const startOfDay = new Date(day);
                  startOfDay.setHours(0, 0, 0, 0);
                  const endOfDay = new Date(day);
                  endOfDay.setHours(23, 59, 59, 999);
                  params.set(
                    "after",
                    Math.floor(startOfDay.getTime() / 1000).toString(),
                  );
                  params.set(
                    "before",
                    Math.ceil(endOfDay.getTime() / 1000).toString(),
                  );
                  window
                    .open(`${baseUrl}review?${params.toString()}`, "_blank")
                    ?.focus();
                }
              }}
            >
              {!alertVideos ? (
                <img
                  className={cn(
                    "h-full w-auto min-w-10 select-none object-contain",
                    isSafari && !isLoaded ? "hidden" : "visible",
                  )}
                  src={`${apiHost}${event.thumb_path.replace("/media/frigate/", "")}`}
                  loading={isSafari ? "eager" : "lazy"}
                  onLoad={() => setIsLoaded(true)}
                />
              ) : (
                <>
                  {previews.length ? (
                    <VideoPreview
                      relevantPreview={previews[previews.length - 1]}
                      startTime={event.start_time}
                      endTime={event.end_time}
                      loop
                      showProgress={false}
                      setReviewed={() => {}}
                      setIgnoreClick={() => {}}
                      isPlayingBack={() => {}}
                      onTimeUpdate={() => {
                        if (!isLoaded) {
                          setIsLoaded(true);
                        }
                      }}
                      windowVisible={windowVisible}
                    />
                  ) : (
                    <video
                      preload="auto"
                      autoPlay
                      playsInline
                      muted
                      disableRemotePlayback
                      loop
                      onTimeUpdate={() => {
                        if (!isLoaded) {
                          setIsLoaded(true);
                        }
                      }}
                    >
                      <source
                        src={`${baseUrl}api/review/${event.id}/preview?format=mp4`}
                        type="video/mp4"
                      />
                    </video>
                  )}
                </>
              )}
            </div>
          )}
          {isLoaded && (
            <div className="absolute inset-x-0 bottom-0 h-6 rounded bg-gradient-to-t from-slate-900/50 to-transparent">
              <div className="absolute bottom-0 left-1 w-full text-xs text-white">
                <TimeAgo time={event.start_time * 1000} dense />
              </div>
            </div>
          )}
          {!isLoaded && (
            <Skeleton
              style={{
                aspectRatio: alertVideos ? aspectRatio : 16 / 9,
              }}
              className="size-full"
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {`${[
          ...new Set([
            ...(event.data.objects || []),
            ...(event.data.sub_labels || []),
            ...(event.data.audio || []),
          ]),
        ]
          .filter((item) => item !== undefined && !item.includes("-verified"))
          .map((text) => text.charAt(0).toUpperCase() + text.substring(1))
          .sort()
          .join(", ")
          .replaceAll("-verified", "")} ` + t("detected")}
      </TooltipContent>
    </Tooltip>
  );
}
