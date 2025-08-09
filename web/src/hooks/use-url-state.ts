import { usePersistence } from "@/hooks/use-persistence";
import {
  parseAsBoolean,
  parseAsFloat,
  parseAsInteger,
  parseAsJson,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from "nuqs";
import { z } from "zod";

export function useGroup() {
  const [group, setGroup] = useQueryState(
    "group",
    parseAsString.withDefault("default"),
  );

  const [persistedValue, setPersistedValue, , deletePersistedValue] =
    usePersistence<string>("group", group);

  const handleSetGroup = (value: string) => {
    setGroup(value);
    setPersistedValue(value);
  };

  const handleDeleteGroup = () => {
    deletePersistedValue();
    setGroup("default");
  };

  return {
    group: group ?? persistedValue,
    setGroup: handleSetGroup,
    deleteGroup: handleDeleteGroup,
  };
}

export function useVolume() {
  const [volume, setVolume] = useQueryState(
    "volume",
    parseAsFloat.withDefault(1.0),
  );

  const [persistedValue, setPersistedValue, , deletePersistedValue] =
    usePersistence<number>("volume", volume);

  const handleSetVolume = (value: number) => {
    setVolume(value);
    setPersistedValue(value);
  };

  const handleDeleteVolume = () => {
    deletePersistedValue();
    setVolume(1.0);
  };

  return {
    volume: volume ?? persistedValue,
    setVolume: handleSetVolume,
    deleteVolume: handleDeleteVolume,
  };
}

export function usePlaybackRate() {
  const [playbackRate, setPlaybackRate] = useQueryState(
    "playbackRate",
    parseAsInteger.withDefault(1),
  );

  return {
    playbackRate,
    setPlaybackRate,
  };
}

export function useMuted() {
  const [muted, setMuted] = useQueryState(
    "muted",
    parseAsBoolean.withDefault(true),
  );

  const [persistedValue, setPersistedValue, , deletePersistedValue] =
    usePersistence<boolean>("muted", muted);

  const handleSetMuted = (value: boolean) => {
    setMuted(value);
    setPersistedValue(value);
  };

  const handleDeleteMuted = () => {
    deletePersistedValue();
    setMuted(true);
  };

  return {
    muted: muted ?? persistedValue,
    setMuted: handleSetMuted,
    deleteMuted: handleDeleteMuted,
  };
}

export function useSeverity() {
  const [severity, setSeverity] = useQueryState(
    "severity",
    parseAsStringEnum(["alert", "detection", "significant_motion"]).withDefault(
      "alert",
    ),
  );

  return {
    severity,
    setSeverity,
  };
}

export function useShowReviewed() {
  const [showReviewed, setShowReviewed] = useQueryState(
    "showReviewed",
    parseAsBoolean.withDefault(true),
  );

  return {
    showReviewed,
    setShowReviewed,
  };
}

const recordingSchema = z.object({
  camera: z.string(),
  startTime: z.number(),
  currentTime: z.number().optional(),
  severity: z.enum(["alert", "detection", "significant_motion"]),
});

export function useRecording() {
  const [recording, setRecording] = useQueryState(
    "recording",
    parseAsJson(recordingSchema.parse).withOptions({
      shallow: true,
    }),
  );

  return {
    recording,
    setRecording,
  };
}

export function useCurrentTime() {
  const [currentTime, setCurrentTime] = useQueryState(
    "currentTime",
    parseAsFloat.withOptions({
      shallow: true,
    }),
  );

  return {
    currentTime,
    setCurrentTime,
  };
}

export function useDateFilter() {
  const [date, setDate] = useQueryState(
    "date",
    parseAsString.withOptions({
      shallow: true,
    }),
  );

  const [after, setAfter] = useQueryState(
    "after",
    parseAsInteger.withOptions({
      shallow: true,
    }),
  );

  const [before, setBefore] = useQueryState(
    "before",
    parseAsInteger.withOptions({
      shallow: true,
    }),
  );

  return {
    date,
    setDate,
    after,
    setAfter,
    before,
    setBefore,
  };
}

export function useTimelineType() {
  const [timelineType, setTimelineType] = useQueryState(
    "timelineType",
    parseAsStringEnum(["timeline", "events"]).withDefault("timeline"),
  );

  return {
    timelineType,
    setTimelineType,
  };
}
