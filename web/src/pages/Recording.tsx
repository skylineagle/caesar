import { useUrlStateNumber, useUrlStateString } from "@/hooks/use-url-state";
import { FrigateConfig } from "@/types/frigateConfig";
import { ReviewFilter } from "@/types/review";
import { RecordingView } from "@/views/recording/RecordingView";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

function Recording() {
  const { data: config } = useSWR<FrigateConfig>("config");

  const [camera] = useUrlStateString("camera");
  const [startTime] = useUrlStateNumber("startTime");
  const [severity] = useUrlStateString("severity");

  const recording = useMemo(() => {
    if (!camera || !startTime) {
      return undefined;
    }

    return {
      camera,
      startTime,
      severity: severity || "alert",
    };
  }, [camera, startTime, severity]);

  const [filter, setFilter] = useState<ReviewFilter>({});

  const timeRange = useMemo(() => {
    if (!startTime) {
      const now = Date.now() / 1000;
      return { after: now - 3600, before: now };
    }

    const startOfDay = new Date(startTime * 1000);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startTime * 1000);
    endOfDay.setHours(23, 59, 59, 999);

    return {
      after: startOfDay.getTime() / 1000,
      before: endOfDay.getTime() / 1000,
    };
  }, [startTime]);

  const allCameras = useMemo(() => {
    if (!config) {
      return [];
    }
    return Object.keys(config.cameras);
  }, [config]);

  useEffect(() => {
    if (camera) {
      const capitalized = camera
        .split("_")
        .filter((text) => text)
        .map((text) => text[0].toUpperCase() + text.substring(1));
      document.title = `${capitalized.join(" ")} Recording - Frigate`;
    } else {
      document.title = "Recording - Frigate";
    }
  }, [camera]);

  if (!config) {
    return <div>Loading...</div>;
  }

  if (!recording) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold">No Recording Selected</h2>
          <p className="mt-2 text-muted-foreground">
            Please select a camera and time to view recordings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <RecordingView
      startCamera={recording.camera}
      startTime={recording.startTime}
      timeRange={timeRange}
      allCameras={allCameras}
      filter={filter}
      updateFilter={setFilter}
    />
  );
}

export default Recording;
