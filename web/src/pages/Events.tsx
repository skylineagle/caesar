import ActivityIndicator from "@/components/indicators/activity-indicator";
import useApiFilter from "@/hooks/use-api-filter";
import { useCameraPreviews } from "@/hooks/use-camera-previews";
import { useTimezone } from "@/hooks/use-date-utils";
import {
  useDateFilter,
  useRecording,
  useSeverity,
  useShowReviewed,
} from "@/hooks/use-url-state";
import { FrigateConfig } from "@/types/frigateConfig";
import {
  RecordingsSummary,
  ReviewFilter,
  ReviewSegment,
  ReviewSummary,
  SegmentedReviewData,
} from "@/types/review";
import EventView from "@/views/events/EventView";
import { RecordingView } from "@/views/recording/RecordingView";
import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useSWR from "swr";

export default function Events() {
  const { t } = useTranslation(["views/events"]);

  const { data: config } = useSWR<FrigateConfig>("config", {
    revalidateOnFocus: false,
  });
  const timezone = useTimezone(config);

  // recordings viewer

  const { severity, setSeverity } = useSeverity();
  const { showReviewed, setShowReviewed } = useShowReviewed();
  const { recording, setRecording } = useRecording();
  const { date, setDate, after, setAfter, before, setBefore } = useDateFilter();
  const [startTime, setStartTime] = useState<number>();
  const [rawParams] = useSearchParams();
  const urlCurrentTime = useMemo(() => {
    const v = rawParams.get("currentTime");
    if (!v) return undefined;
    const num = parseFloat(v);
    return Number.isFinite(num) ? num : undefined;
  }, [rawParams]);

  useEffect(() => {
    if (recording) {
      document.title = t("recordings.documentTitle");
    } else {
      document.title = t("documentTitle");
    }
  }, [recording, severity, t]);

  // review filter

  const [reviewFilter, setReviewFilter, reviewSearchParams] =
    useApiFilter<ReviewFilter>();

  const onUpdateFilter = (newFilter: ReviewFilter) => {
    setReviewFilter(newFilter);

    // update recording start time if filter
    // was changed on recording page
    if (newFilter.after != undefined) {
      setRecording((prevRecording) => {
        if (!prevRecording) return prevRecording;
        return { ...prevRecording, startTime: newFilter.after! };
      });
    }

    // Update URL state with the new filter values
    if (newFilter.after !== undefined) {
      setAfter(newFilter.after);
    }
    if (newFilter.before !== undefined) {
      setBefore(newFilter.before);
    }
  };

  // review paging

  const [beforeTs, setBeforeTs] = useState(Math.ceil(Date.now() / 1000));
  const last24Hours = useMemo(() => {
    return { before: beforeTs, after: getHoursAgo(24) };
  }, [beforeTs]);
  const selectedTimeRange = useMemo(() => {
    // If we have explicit after/before parameters in URL state, use them
    if (after !== null && before !== null) {
      return {
        before: before,
        after: after,
      };
    }

    // If we have a date parameter from a shared recording, use that date
    if (date && recording) {
      const recordingDate = new Date(date);
      const startOfDay = new Date(recordingDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(recordingDate);
      endOfDay.setHours(23, 59, 59, 999);

      const newAfter = Math.floor(startOfDay.getTime() / 1000);
      const newBefore = Math.ceil(endOfDay.getTime() / 1000);

      // Update the URL state with the calculated time range
      setAfter(newAfter);
      setBefore(newBefore);

      return {
        before: newBefore,
        after: newAfter,
      };
    }

    // Otherwise use the default last 24 hours
    return last24Hours;
  }, [last24Hours, after, before, date, recording, setAfter, setBefore]);

  // we want to update the items whenever the severity changes
  useEffect(() => {
    if (recording) {
      return;
    }

    const now = Date.now() / 1000;

    if (now - beforeTs > 60) {
      setBeforeTs(now);
    }

    // only refresh when severity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity]);

  const reviewSegmentFetcher = useCallback((key: Array<string> | string) => {
    const [path, params] = Array.isArray(key) ? key : [key, undefined];
    return axios.get(path, { params }).then((res) => res.data);
  }, []);

  const getKey = useCallback(() => {
    const params = {
      cameras: reviewSearchParams["cameras"],
      labels: reviewSearchParams["labels"],
      zones: reviewSearchParams["zones"],
      reviewed: 1,
      before: before || last24Hours.before,
      after: after || last24Hours.after,
    };
    return ["review", params];
  }, [reviewSearchParams, before, after, last24Hours]);

  const { data: reviews, mutate: updateSegments } = useSWR<ReviewSegment[]>(
    getKey,
    reviewSegmentFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const reviewItems = useMemo<SegmentedReviewData>(() => {
    if (!reviews) {
      return undefined;
    }

    const all: ReviewSegment[] = [];
    const alerts: ReviewSegment[] = [];
    const detections: ReviewSegment[] = [];
    const motion: ReviewSegment[] = [];

    reviews?.forEach((segment) => {
      all.push(segment);

      switch (segment.severity) {
        case "alert":
          alerts.push(segment);
          break;
        case "detection":
          detections.push(segment);
          break;
        default:
          motion.push(segment);
          break;
      }
    });

    return {
      all: all,
      alert: alerts,
      detection: detections,
      significant_motion: motion,
    };
  }, [reviews]);

  const currentItems = useMemo(() => {
    if (!reviewItems || !severity) {
      return null;
    }

    let current;

    if (reviewFilter?.showAll) {
      current = reviewItems.all;
    } else {
      current = reviewItems[severity];
    }

    if (!current || current.length == 0) {
      return [];
    }

    if (!showReviewed) {
      return current.filter((seg) => !seg.has_been_reviewed);
    } else {
      return current;
    }
    // only refresh when severity or filter changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, reviewFilter, showReviewed, reviewItems?.all.length]);

  // review summary

  const { data: reviewSummary, mutate: updateSummary } = useSWR<ReviewSummary>(
    [
      "review/summary",
      {
        timezone: timezone,
        cameras: reviewSearchParams["cameras"] ?? null,
        labels: reviewSearchParams["labels"] ?? null,
        zones: reviewSearchParams["zones"] ?? null,
      },
    ],
    {
      revalidateOnFocus: true,
      refreshInterval: 30000,
      revalidateOnReconnect: false,
    },
  );

  const reloadData = useCallback(() => {
    setBeforeTs(Date.now() / 1000);
    updateSummary();
  }, [updateSummary]);

  // recordings summary

  const { data: recordingsSummary } = useSWR<RecordingsSummary>([
    "recordings/summary",
    {
      timezone: timezone,
      cameras: reviewSearchParams["cameras"] ?? null,
    },
  ]);

  // preview videos
  const previewTimes = useMemo(() => {
    const startDate = new Date(selectedTimeRange.after * 1000);
    startDate.setUTCMinutes(0, 0, 0);

    const endDate = new Date(selectedTimeRange.before * 1000);
    endDate.setHours(endDate.getHours() + 1, 0, 0, 0);

    return {
      after: startDate.getTime() / 1000,
      before: endDate.getTime() / 1000,
    };
  }, [selectedTimeRange]);

  const allPreviews = useCameraPreviews(
    previewTimes ?? { after: 0, before: 0 },
    {
      fetchPreviews: previewTimes != undefined,
    },
  );

  // review status

  const markAllItemsAsReviewed = useCallback(
    async (currentItems: ReviewSegment[]) => {
      if (currentItems.length == 0) {
        return;
      }

      const severity = currentItems[0].severity;
      updateSegments(
        (data: ReviewSegment[] | undefined) => {
          if (!data) {
            return data;
          }

          const newData = [...data];

          newData.forEach((seg) => {
            if (seg.end_time && seg.severity == severity) {
              seg.has_been_reviewed = true;
            }
          });

          return newData;
        },
        { revalidate: false, populateCache: true },
      );

      const itemsToMarkReviewed = currentItems
        ?.filter((seg) => seg.end_time)
        ?.map((seg) => seg.id);

      if (itemsToMarkReviewed.length > 0) {
        await axios.post(`reviews/viewed`, {
          ids: itemsToMarkReviewed,
        });
        reloadData();
      }
    },
    [reloadData, updateSegments],
  );

  const markItemAsReviewed = useCallback(
    async (review: ReviewSegment) => {
      const resp = await axios.post(`reviews/viewed`, { ids: [review.id] });

      if (resp.status == 200) {
        updateSegments(
          (data: ReviewSegment[] | undefined) => {
            if (!data) {
              return data;
            }

            const reviewIndex = data.findIndex((item) => item.id == review.id);
            if (reviewIndex == -1) {
              return data;
            }

            const newData = [
              ...data.slice(0, reviewIndex),
              { ...data[reviewIndex], has_been_reviewed: true },
              ...data.slice(reviewIndex + 1),
            ];

            return newData;
          },
          { revalidate: false, populateCache: true },
        );

        updateSummary(
          (data: ReviewSummary | undefined) => {
            if (!data) {
              return data;
            }

            const day = new Date(review.start_time * 1000);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let key;
            if (day.getTime() > today.getTime()) {
              key = "last24Hours";
            } else {
              key = `${day.getFullYear()}-${("0" + (day.getMonth() + 1)).slice(-2)}-${("0" + day.getDate()).slice(-2)}`;
            }

            if (!Object.keys(data).includes(key)) {
              return data;
            }

            const item = data[key];
            return {
              ...data,
              [key]: {
                ...item,
                reviewed_alert:
                  review.severity == "alert"
                    ? item.reviewed_alert + 1
                    : item.reviewed_alert,
                reviewed_detection:
                  review.severity == "detection"
                    ? item.reviewed_detection + 1
                    : item.reviewed_detection,
              },
            };
          },
          { revalidate: false, populateCache: true },
        );
      }
    },
    [updateSegments, updateSummary],
  );

  // selected items

  const selectedReviewData = useMemo(() => {
    if (!recording) {
      return undefined;
    }

    if (!config) {
      return undefined;
    }

    const allCameras = reviewFilter?.cameras ?? [recording.camera];

    // Check if the stored timestamps are still valid
    let startTime =
      urlCurrentTime ?? recording.currentTime ?? recording.startTime;

    // If the stored timestamp is too old (more than 30 days), use the start of the day from the date parameter
    if (date) {
      const recordingDate = new Date(date);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      if (recordingDate < thirtyDaysAgo) {
        // Use the start of the day from the date parameter
        const startOfDay = new Date(recordingDate);
        startOfDay.setHours(0, 0, 0, 0);
        startTime = Math.floor(startOfDay.getTime() / 1000);
      }
    }

    return {
      camera: recording.camera,
      start_time: startTime,
      allCameras: allCameras,
    };

    // previews will not update after item is selected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, date, reviewFilter?.cameras, urlCurrentTime, config]);

  // keep the review filter's day in sync with URL after/before so UI shows the right day
  useEffect(() => {
    if (after !== null && before !== null) {
      if (reviewFilter?.after !== after || reviewFilter?.before !== before) {
        setReviewFilter({
          ...(reviewFilter ?? ({} as ReviewFilter)),
          after,
          before,
        });
      }
    }
  }, [after, before, reviewFilter, setReviewFilter]);

  useEffect(() => {
    if (recording) {
      if (
        !reviewFilter?.cameras ||
        reviewFilter.cameras[0] !== recording.camera ||
        reviewFilter.cameras.length !== 1
      ) {
        const next: ReviewFilter = {
          ...(reviewFilter ?? ({} as ReviewFilter)),
          cameras: [recording.camera],
        } as ReviewFilter;
        setReviewFilter(next);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording?.camera]);

  useEffect(() => {
    if (recording) {
      // Check if the recording data is too old and clear it if necessary
      const now = Date.now() / 1000;
      const recordingAge = now - recording.startTime;
      const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds

      if (recordingAge > maxAge && !date) {
        // Recording is too old and we don't have a date parameter, clear it
        setRecording(null);
        return;
      }

      setStartTime(recording.startTime);
    } else {
      // Clear date filter when no recording is active
      setDate(null);
      setAfter(null);
      setBefore(null);
    }
  }, [recording, date, setRecording, setDate, setAfter, setBefore]);

  // Handle URL state changes when date parameters are manually set
  useEffect(() => {
    if (date && !after && !before) {
      // If we have a date but no time range, calculate the full day
      const recordingDate = new Date(date);
      const startOfDay = new Date(recordingDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(recordingDate);
      endOfDay.setHours(23, 59, 59, 999);

      setAfter(Math.floor(startOfDay.getTime() / 1000));
      setBefore(Math.ceil(endOfDay.getTime() / 1000));
    }
  }, [date, after, before, setAfter, setBefore]);

  if (!timezone) {
    return <ActivityIndicator />;
  }

  if (recording) {
    if (selectedReviewData) {
      return (
        <RecordingView
          key={selectedTimeRange.before}
          startCamera={selectedReviewData.camera}
          startTime={selectedReviewData.start_time}
          allCameras={selectedReviewData.allCameras}
          reviewItems={reviews}
          reviewSummary={reviewSummary}
          allPreviews={allPreviews}
          timeRange={selectedTimeRange}
          filter={reviewFilter}
          updateFilter={onUpdateFilter}
        />
      );
    }
  } else {
    return (
      <EventView
        reviewItems={reviewItems}
        currentReviewItems={currentItems}
        reviewSummary={reviewSummary}
        recordingsSummary={recordingsSummary}
        relevantPreviews={allPreviews}
        timeRange={selectedTimeRange}
        filter={reviewFilter}
        severity={severity ?? "alert"}
        startTime={startTime}
        showReviewed={showReviewed ?? false}
        setShowReviewed={setShowReviewed}
        setSeverity={setSeverity}
        markItemAsReviewed={markItemAsReviewed}
        markAllItemsAsReviewed={markAllItemsAsReviewed}
        onOpenRecording={(recordingInfo) => {
          // Set the recording and also set the date parameter for better time range handling
          setRecording(recordingInfo);

          // Calculate the date from the start time
          const recordingDate = new Date(recordingInfo.startTime * 1000);
          const dateString = recordingDate.toISOString().split("T")[0]; // YYYY-MM-DD format
          setDate(dateString);
        }}
        pullLatestData={reloadData}
        updateFilter={onUpdateFilter}
      />
    );
  }
}

function getHoursAgo(hours: number): number {
  const now = new Date();
  now.setHours(now.getHours() - hours);
  return Math.ceil(now.getTime() / 1000);
}
