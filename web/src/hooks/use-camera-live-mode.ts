import { CameraConfig, FrigateConfig } from "@/types/frigateConfig";
import { LivePlayerMode, LiveStreamMetadata } from "@/types/live";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

export default function useCameraLiveMode(
  cameras: CameraConfig[],
  windowVisible: boolean,
) {
  const { data: config } = useSWR<FrigateConfig>("config");
  const { data: allStreamMetadata } = useSWR<{
    [key: string]: LiveStreamMetadata;
  }>(config ? "go2rtc/streams" : null, {
    revalidateOnFocus: false,
    onError: () => {
      // Ignore go2rtc errors - they happen when streams aren't configured
    },
  });

  const [preferredLiveModes, setPreferredLiveModes] = useState<{
    [key: string]: LivePlayerMode;
  }>({});
  const [isRestreamedStates, setIsRestreamedStates] = useState<{
    [key: string]: boolean;
  }>({});
  const [supportsAudioOutputStates, setSupportsAudioOutputStates] = useState<{
    [key: string]: {
      supportsAudio: boolean;
      cameraName: string;
    };
  }>({});

  useEffect(() => {
    if (!cameras) return;

    const mseSupported =
      "MediaSource" in window || "ManagedMediaSource" in window;

    const newPreferredLiveModes: { [key: string]: LivePlayerMode } = {};
    const newIsRestreamedStates: { [key: string]: boolean } = {};
    const newSupportsAudioOutputStates: {
      [key: string]: { supportsAudio: boolean; cameraName: string };
    } = {};

    cameras.forEach((camera) => {
      const isRestreamed =
        config &&
        Object.keys(config.go2rtc.streams || {}).includes(
          Object.values(camera.live.streams)[0],
        );

      newIsRestreamedStates[camera.name] = isRestreamed ?? false;

      // Always use ultra-low-latency mode: WebRTC for restreamed cameras, JSMpeg for others
      if (!mseSupported) {
        newPreferredLiveModes[camera.name] = isRestreamed ? "webrtc" : "jsmpeg";
      } else {
        newPreferredLiveModes[camera.name] = isRestreamed ? "webrtc" : "jsmpeg";
      }

      // check each stream for audio support
      if (isRestreamed) {
        Object.values(camera.live.streams).forEach((streamName) => {
          const metadata = allStreamMetadata?.[streamName];
          newSupportsAudioOutputStates[streamName] = {
            supportsAudio: metadata
              ? metadata.producers.find(
                  (prod) =>
                    prod.medias &&
                    prod.medias.find((media) =>
                      media.includes("audio, recvonly"),
                    ) !== undefined,
                ) !== undefined
              : false,
            cameraName: camera.name,
          };
        });
      } else {
        newSupportsAudioOutputStates[camera.name] = {
          supportsAudio: false,
          cameraName: camera.name,
        };
      }
    });

    setPreferredLiveModes(newPreferredLiveModes);
    setIsRestreamedStates(newIsRestreamedStates);
    setSupportsAudioOutputStates(newSupportsAudioOutputStates);
  }, [cameras, config, windowVisible, allStreamMetadata]);

  const resetPreferredLiveMode = useCallback(
    (cameraName: string) => {
      const mseSupported =
        "MediaSource" in window || "ManagedMediaSource" in window;
      const isRestreamed =
        config && Object.keys(config.go2rtc.streams || {}).includes(cameraName);

      setPreferredLiveModes((prevModes) => {
        const newModes = { ...prevModes };

        // Always use ultra-low-latency mode: WebRTC for restreamed cameras, JSMpeg for others
        if (!mseSupported) {
          newModes[cameraName] = isRestreamed ? "webrtc" : "jsmpeg";
        } else {
          newModes[cameraName] = isRestreamed ? "webrtc" : "jsmpeg";
        }

        return newModes;
      });
    },
    [config],
  );

  return {
    preferredLiveModes,
    setPreferredLiveModes,
    resetPreferredLiveMode,
    isRestreamedStates,
    supportsAudioOutputStates,
  };
}
