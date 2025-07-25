import { useEffect, useMemo } from "react";
import { isDesktop, isIOS, isMobileOnly, isSafari } from "react-device-detect";
import useSWR from "swr";
import { useApiHost } from "@/api";
import { cn } from "@/lib/utils";
import { BsArrowRightCircle } from "react-icons/bs";
import { useNavigate } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { SearchResult } from "@/types/search";
import ImageLoadingIndicator from "@/components/indicators/ImageLoadingIndicator";
import useImageLoaded from "@/hooks/use-image-loaded";
import ActivityIndicator from "@/components/indicators/activity-indicator";
import { useTrackedObjectUpdate } from "@/api/ws";
import { isEqual } from "lodash";
import TimeAgo from "@/components/dynamic/TimeAgo";
import SearchResultActions from "@/components/menu/SearchResultActions";
import { SearchTab } from "@/components/overlay/detail/SearchDetailDialog";
import { FrigateConfig } from "@/types/frigateConfig";
import { useTranslation } from "react-i18next";
import { getTranslatedLabel } from "@/utils/i18n";

type ExploreViewProps = {
  searchDetail: SearchResult | undefined;
  setSearchDetail: (search: SearchResult | undefined) => void;
  setSimilaritySearch: (search: SearchResult) => void;
  onSelectSearch: (item: SearchResult, ctrl: boolean, page?: SearchTab) => void;
};

export default function ExploreView({
  searchDetail,
  setSearchDetail,
  setSimilaritySearch,
  onSelectSearch,
}: ExploreViewProps) {
  const { t } = useTranslation(["views/explore"]);
  // title

  useEffect(() => {
    document.title = t("documentTitle");
  }, [t]);

  // data

  const {
    data: events,
    mutate,
    isLoading,
    isValidating,
  } = useSWR<SearchResult[]>(
    [
      "events/explore",
      {
        limit: isMobileOnly ? 5 : 10,
      },
    ],
    {
      revalidateOnFocus: true,
    },
  );

  const eventsByLabel = useMemo(() => {
    if (!events) return {};
    return events.reduce<Record<string, SearchResult[]>>((acc, event) => {
      const label = event.label || "Unknown";
      if (!acc[label]) {
        acc[label] = [];
      }
      acc[label].push(event);
      return acc;
    }, {});
  }, [events]);

  const trackedObjectUpdate = useTrackedObjectUpdate();

  useEffect(() => {
    mutate();
    // mutate / revalidate when event description updates come in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedObjectUpdate]);

  // update search detail when results change

  useEffect(() => {
    if (searchDetail && events) {
      const updatedSearchDetail = events.find(
        (result) => result.id === searchDetail.id,
      );

      if (updatedSearchDetail && !isEqual(updatedSearchDetail, searchDetail)) {
        setSearchDetail(updatedSearchDetail);
      }
    }
  }, [events, searchDetail, setSearchDetail]);

  if (isLoading) {
    return (
      <ActivityIndicator className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
    );
  }

  return (
    <div className="mx-2 space-y-4">
      {Object.entries(eventsByLabel).map(([label, filteredEvents]) => (
        <ThumbnailRow
          key={label}
          searchResults={filteredEvents}
          isValidating={isValidating}
          objectType={label}
          setSearchDetail={setSearchDetail}
          mutate={mutate}
          setSimilaritySearch={setSimilaritySearch}
          onSelectSearch={onSelectSearch}
        />
      ))}
    </div>
  );
}

type ThumbnailRowType = {
  objectType: string;
  searchResults?: SearchResult[];
  isValidating: boolean;
  setSearchDetail: (search: SearchResult | undefined) => void;
  mutate: () => void;
  setSimilaritySearch: (search: SearchResult) => void;
  onSelectSearch: (item: SearchResult, ctrl: boolean, page?: SearchTab) => void;
};

function ThumbnailRow({
  objectType,
  searchResults,
  isValidating,
  setSearchDetail,
  mutate,
  setSimilaritySearch,
  onSelectSearch,
}: ThumbnailRowType) {
  const { t } = useTranslation(["views/explore"]);
  const navigate = useNavigate();

  const handleSearch = (label: string) => {
    const similaritySearchParams = new URLSearchParams({
      labels: label,
    }).toString();
    navigate(`/explore?${similaritySearchParams}`);
  };

  return (
    <div className="rounded-lg bg-background_alt p-2 md:px-4">
      <div className="flex flex-row items-center text-lg smart-capitalize">
        {getTranslatedLabel(objectType)}
        {searchResults && (
          <span className="ml-3 text-sm text-secondary-foreground">
            {t("trackedObjectsCount", {
              // @ts-expect-error we know this is correct
              count: searchResults[0].event_count,
            })}
          </span>
        )}
        {isValidating && <ActivityIndicator className="ml-2 size-4" />}
      </div>
      <div className="flex flex-row items-center space-x-2 py-2">
        {searchResults?.map((event) => (
          <div
            key={event.id}
            className="relative aspect-square h-auto max-w-[20%] flex-grow md:max-w-[10%]"
          >
            <ExploreThumbnailImage
              event={event}
              setSearchDetail={setSearchDetail}
              mutate={mutate}
              setSimilaritySearch={setSimilaritySearch}
              onSelectSearch={onSelectSearch}
            />
          </div>
        ))}
        <div
          className="flex cursor-pointer items-center justify-center"
          onClick={() => handleSearch(objectType)}
        >
          <Tooltip>
            <TooltipTrigger>
              <BsArrowRightCircle
                className="ml-2 text-secondary-foreground transition-all duration-300 hover:text-primary"
                size={24}
              />
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent>
                {t("exploreMore", { label: getTranslatedLabel(objectType) })}
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

type ExploreThumbnailImageProps = {
  event: SearchResult;
  setSearchDetail: (search: SearchResult | undefined) => void;
  mutate: () => void;
  setSimilaritySearch: (search: SearchResult) => void;
  onSelectSearch: (item: SearchResult, ctrl: boolean, page?: SearchTab) => void;
};
function ExploreThumbnailImage({
  event,
  setSearchDetail,
  mutate,
  setSimilaritySearch,
  onSelectSearch,
}: ExploreThumbnailImageProps) {
  const apiHost = useApiHost();
  const { data: config } = useSWR<FrigateConfig>("config");
  const [imgRef, imgLoaded, onImgLoad] = useImageLoaded();

  const handleFindSimilar = () => {
    if (config?.semantic_search.enabled) {
      setSimilaritySearch(event);
    }
  };

  const handleShowObjectLifecycle = () => {
    onSelectSearch(event, false, "object_lifecycle");
  };

  const handleShowSnapshot = () => {
    onSelectSearch(event, false, "snapshot");
  };

  return (
    <SearchResultActions
      searchResult={event}
      findSimilar={handleFindSimilar}
      refreshResults={mutate}
      showObjectLifecycle={handleShowObjectLifecycle}
      showSnapshot={handleShowSnapshot}
      isContextMenu={true}
    >
      <div className="relative size-full">
        <ImageLoadingIndicator
          className="absolute inset-0"
          imgLoaded={imgLoaded}
        />
        <img
          ref={imgRef}
          className={cn(
            "absolute size-full cursor-pointer rounded-lg object-cover transition-all duration-300 ease-in-out lg:rounded-2xl",
            !imgLoaded && "invisible",
          )}
          style={
            isIOS
              ? {
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                }
              : undefined
          }
          loading={isSafari ? "eager" : "lazy"}
          draggable={false}
          src={`${apiHost}api/events/${event.id}/thumbnail.webp`}
          onClick={() => setSearchDetail(event)}
          onLoad={onImgLoad}
          alt={`${event.label} thumbnail`}
        />
        {isDesktop && (
          <div className="absolute bottom-1 right-1 z-10 rounded-lg bg-black/50 px-2 py-1 text-xs text-white">
            {event.end_time ? (
              <TimeAgo time={event.start_time * 1000} dense />
            ) : (
              <div>
                <ActivityIndicator size={10} />
              </div>
            )}
          </div>
        )}
      </div>
    </SearchResultActions>
  );
}
