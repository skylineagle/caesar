import { baseUrl } from "@/api/baseUrl";
import {
  LivePlayerError,
  PlayerStatsType,
  StreamingPriority,
} from "@/types/live";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WebRtcPlayerProps = {
  className?: string;
  camera: string;
  playbackEnabled?: boolean;
  audioEnabled?: boolean;
  volume?: number;
  microphoneEnabled?: boolean;
  iOSCompatFullScreen?: boolean; // ios doesn't support fullscreen divs so we must support the video element
  pip?: boolean;
  getStats?: boolean;
  setStats?: (stats: PlayerStatsType) => void;
  onPlaying?: () => void;
  onError?: (error: LivePlayerError) => void;
  videoEffects?: boolean;
  streamingPriority?: StreamingPriority;
  streamIndex?: number;
};

export default function WebRtcPlayer({
  className,
  camera,
  playbackEnabled = true,
  audioEnabled = false,
  volume,
  microphoneEnabled = false,
  iOSCompatFullScreen = false,
  pip = false,
  getStats = false,
  setStats,
  onPlaying,
  onError,
  streamingPriority = "ultra-low-latency",
  streamIndex = 0,
}: WebRtcPlayerProps) {
  // metadata

  const wsURL = useMemo(() => {
    return `${baseUrl.replace(/^http/, "ws")}live/webrtc/api/ws?src=${camera}`;
  }, [camera]);

  // camera states

  const pcRef = useRef<RTCPeerConnection | undefined>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [bufferTimeout, setBufferTimeout] = useState<NodeJS.Timeout>();
  const videoLoadTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const connectionAttempts = useRef<number>(0);
  const maxReconnectAttempts =
    streamingPriority === "ultra-low-latency" ? 10 : 3;

  // video effects are managed by the floating VideoEffectsControl
  // and applied at the container level in LivePlayer

  const PeerConnection = useCallback(
    async (media: string) => {
      if (!videoRef.current) {
        return;
      }

      const pc = new RTCPeerConnection({
        bundlePolicy: "max-bundle",
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      const localTracks = [];

      if (/camera|microphone/.test(media)) {
        const tracks = await getMediaTracks("user", {
          video: media.indexOf("camera") >= 0,
          audio: media.indexOf("microphone") >= 0,
        });
        tracks.forEach((track) => {
          pc.addTransceiver(track, { direction: "sendonly" });
          if (track.kind === "video") localTracks.push(track);
        });
      }

      if (media.indexOf("display") >= 0) {
        const tracks = await getMediaTracks("display", {
          video: true,
          audio: media.indexOf("speaker") >= 0,
        });
        tracks.forEach((track) => {
          pc.addTransceiver(track, { direction: "sendonly" });
          if (track.kind === "video") localTracks.push(track);
        });
      }

      if (/video|audio/.test(media)) {
        const tracks = ["video", "audio"]
          .filter((kind) => media.indexOf(kind) >= 0)
          .map(
            (kind) =>
              pc.addTransceiver(kind, { direction: "recvonly" }).receiver.track,
          );
        localTracks.push(...tracks);
      }

      videoRef.current.srcObject = new MediaStream(localTracks);
      return pc;
    },
    [videoRef],
  );

  async function getMediaTracks(
    media: string,
    constraints: MediaStreamConstraints,
  ) {
    try {
      const stream =
        media === "user"
          ? await navigator.mediaDevices.getUserMedia(constraints)
          : await navigator.mediaDevices.getDisplayMedia(constraints);
      return stream.getTracks();
    } catch (e) {
      return [];
    }
  }

  const reconnect = useCallback(() => {
    if (connectionAttempts.current >= maxReconnectAttempts) {
      // Max attempts reached, signal error for potential fallback
      if (streamingPriority !== "ultra-low-latency") {
        onError?.("stalled");
      }
      return;
    }

    connectionAttempts.current += 1;

    // Faster reconnection for ultra-low-latency mode
    const reconnectDelay =
      streamingPriority === "ultra-low-latency" ? 1000 : 3000;

    reconnectTimeoutRef.current = setTimeout(() => {
      if (playbackEnabled) {
        const aPc = PeerConnection(
          microphoneEnabled ? "video+audio+microphone" : "video+audio",
        );
        connect(aPc);
      }
    }, reconnectDelay);
  }, [
    streamingPriority,
    maxReconnectAttempts,
    onError,
    playbackEnabled,
    microphoneEnabled,
    PeerConnection,
  ]);

  const connect = useCallback(
    async (aPc: Promise<RTCPeerConnection | undefined>) => {
      if (!aPc) {
        return;
      }

      try {
        pcRef.current = await aPc;
        const ws = new WebSocket(wsURL);

        ws.addEventListener("open", () => {
          // Reset connection attempts on successful connection
          connectionAttempts.current = 0;

          pcRef.current?.addEventListener("icecandidate", (ev) => {
            if (!ev.candidate) return;
            const msg = {
              type: "webrtc/candidate",
              value: ev.candidate.candidate,
            };
            ws.send(JSON.stringify(msg));
          });

          pcRef.current
            ?.createOffer()
            .then((offer) => pcRef.current?.setLocalDescription(offer))
            .then(() => {
              const msg = {
                type: "webrtc/offer",
                value: pcRef.current?.localDescription?.sdp,
              };
              ws.send(JSON.stringify(msg));
            })
            .catch(() => {
              reconnect();
            });
        });

        ws.addEventListener("error", () => {
          reconnect();
        });

        ws.addEventListener("close", () => {
          if (playbackEnabled) {
            reconnect();
          }
        });

        ws.addEventListener("message", (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.type === "webrtc/candidate") {
            pcRef.current?.addIceCandidate({
              candidate: msg.value,
              sdpMid: "0",
            });
          } else if (msg.type === "webrtc/answer") {
            pcRef.current?.setRemoteDescription({
              type: "answer",
              sdp: msg.value,
            });
          }
        });

        // Add connection state monitoring
        pcRef.current?.addEventListener("connectionstatechange", () => {
          if (
            pcRef.current?.connectionState === "failed" ||
            pcRef.current?.connectionState === "disconnected"
          ) {
            reconnect();
          }
        });
      } catch (error) {
        reconnect();
      }
    },
    [wsURL, reconnect, playbackEnabled],
  );

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    if (!playbackEnabled) {
      return;
    }

    const aPc = PeerConnection(
      microphoneEnabled ? "video+audio+microphone" : "video+audio",
    );
    connect(aPc);

    return () => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = undefined;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      connectionAttempts.current = 0;
    };
  }, [
    camera,
    connect,
    PeerConnection,
    pcRef,
    videoRef,
    playbackEnabled,
    microphoneEnabled,
  ]);

  // ios compat

  const [iOSCompatControls, setiOSCompatControls] = useState(false);

  // control pip

  useEffect(() => {
    if (!videoRef.current || !pip) {
      return;
    }

    videoRef.current.requestPictureInPicture();
  }, [pip, videoRef]);

  // Immediate reconnection when page becomes visible for ultra-low-latency mode
  useEffect(() => {
    if (streamingPriority !== "ultra-low-latency") {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && playbackEnabled) {
        // Reset connection attempts and try immediate reconnection
        connectionAttempts.current = 0;
        if (
          !pcRef.current ||
          pcRef.current.connectionState === "failed" ||
          pcRef.current.connectionState === "disconnected" ||
          pcRef.current.connectionState === "closed"
        ) {
          const aPc = PeerConnection(
            microphoneEnabled ? "video+audio+microphone" : "video+audio",
          );
          connect(aPc);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    streamingPriority,
    playbackEnabled,
    microphoneEnabled,
    PeerConnection,
    connect,
  ]);

  // control volume

  useEffect(() => {
    if (!videoRef.current || volume == undefined) {
      return;
    }

    videoRef.current.volume = volume;
  }, [volume, videoRef]);

  useEffect(() => {
    const getTimeout = () => {
      if (streamingPriority === "ultra-low-latency") {
        return 15000 + streamIndex * 2000;
      }
      return 5000 + streamIndex * 1000;
    };

    const staggerDelay =
      streamingPriority === "ultra-low-latency"
        ? streamIndex * 500
        : streamIndex * 200;

    const timeoutId = setTimeout(() => {
      videoLoadTimeoutRef.current = setTimeout(() => {
        if (streamingPriority === "ultra-low-latency") {
          return;
        }
        onError?.("stalled");
      }, getTimeout());
    }, staggerDelay);

    return () => {
      clearTimeout(timeoutId);
      if (videoLoadTimeoutRef.current) {
        clearTimeout(videoLoadTimeoutRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
    // we know that these deps are correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingPriority, streamIndex]);

  const handleLoadedData = () => {
    if (videoLoadTimeoutRef.current) {
      clearTimeout(videoLoadTimeoutRef.current);
    }
    onPlaying?.();
  };

  // stats

  useEffect(() => {
    if (!pcRef.current || !getStats) return;

    let lastBytesReceived = 0;
    let lastTimestamp = 0;

    const interval = setInterval(async () => {
      if (pcRef.current && videoRef.current && !videoRef.current.paused) {
        const report = await pcRef.current.getStats();
        let bytesReceived = 0;
        let timestamp = 0;
        let roundTripTime = 0;
        let framesReceived = 0;
        let framesDropped = 0;
        let framesDecoded = 0;

        report.forEach((stat) => {
          if (stat.type === "inbound-rtp" && stat.kind === "video") {
            bytesReceived = stat.bytesReceived;
            timestamp = stat.timestamp;
            framesReceived = stat.framesReceived;
            framesDropped = stat.framesDropped;
            framesDecoded = stat.framesDecoded;
          }
          if (stat.type === "candidate-pair" && stat.state === "succeeded") {
            roundTripTime = stat.currentRoundTripTime;
          }
        });

        const timeDiff = (timestamp - lastTimestamp) / 1000; // in seconds
        const bitrate =
          timeDiff > 0
            ? (bytesReceived - lastBytesReceived) / timeDiff / 1000
            : 0; // in kbps

        setStats?.({
          streamType: "WebRTC",
          bandwidth: Math.round(bitrate),
          latency: roundTripTime,
          totalFrames: framesReceived,
          droppedFrames: framesDropped,
          decodedFrames: framesDecoded,
          droppedFrameRate:
            framesReceived > 0 ? (framesDropped / framesReceived) * 100 : 0,
        });

        lastBytesReceived = bytesReceived;
        lastTimestamp = timestamp;
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      setStats?.({
        streamType: "-",
        bandwidth: 0,
        latency: undefined,
        totalFrames: 0,
        droppedFrames: undefined,
        decodedFrames: 0,
        droppedFrameRate: 0,
      });
    };
    // we need to listen on the value of the ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcRef, pcRef.current, getStats]);

  return (
    <video
      ref={videoRef}
      className={className}
      controls={iOSCompatControls}
      autoPlay
      playsInline
      muted={!audioEnabled}
      onLoadedData={handleLoadedData}
      onProgress={
        onError != undefined
          ? () => {
              if (videoRef.current?.paused) {
                return;
              }

              if (bufferTimeout) {
                clearTimeout(bufferTimeout);
                setBufferTimeout(undefined);
              }

              setBufferTimeout(
                setTimeout(
                  () => {
                    if (
                      document.visibilityState === "visible" &&
                      pcRef.current != undefined
                    ) {
                      if (streamingPriority === "ultra-low-latency") {
                        return;
                      }
                      onError("stalled");
                    }
                  },
                  streamingPriority === "ultra-low-latency" ? 10000 : 3000,
                ),
              );
            }
          : undefined
      }
      onClick={
        iOSCompatFullScreen
          ? () => setiOSCompatControls(!iOSCompatControls)
          : undefined
      }
      onError={(e) => {
        if (
          // @ts-expect-error code does exist
          e.target.error.code == MediaError.MEDIA_ERR_NETWORK
        ) {
          onError?.("startup");
        }
      }}
    />
  );
}
