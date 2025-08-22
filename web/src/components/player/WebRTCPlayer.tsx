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
  const wsRef = useRef<WebSocket | undefined>();
  const [bufferTimeout, setBufferTimeout] = useState<NodeJS.Timeout>();
  const videoLoadTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const connectionAttempts = useRef<number>(0);
  const maxReconnectAttempts =
    streamingPriority === "ultra-low-latency" ? 10 : 3;
  const isConnecting = useRef<boolean>(false);
  const reconnectRef = useRef<(() => void) | undefined>();

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
        // Optimize for ultra-low latency
        iceCandidatePoolSize:
          streamingPriority === "ultra-low-latency" ? 10 : 0,
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
    [videoRef, streamingPriority],
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

  const cleanupConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = undefined;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = undefined;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    isConnecting.current = false;
  }, []);

  const connect = useCallback(
    async (pc: Promise<RTCPeerConnection | undefined>) => {
      if (isConnecting.current) {
        return; // Prevent multiple simultaneous connection attempts
      }

      isConnecting.current = true;

      try {
        const peerConnection = await pc;
        if (!peerConnection) {
          isConnecting.current = false;
          return;
        }

        pcRef.current = peerConnection;

        // Setup WebSocket for signaling
        const ws = new WebSocket(wsURL);
        wsRef.current = ws;

        ws.onopen = () => {
          connectionAttempts.current = 0; // Reset on successful connection
        };

        ws.onmessage = async (event) => {
          const data = JSON.parse(event.data);

          try {
            if (data.type === "offer") {
              await peerConnection.setRemoteDescription(data);
              const answer = await peerConnection.createAnswer();
              await peerConnection.setLocalDescription(answer);
              ws.send(JSON.stringify(answer));
            } else if (data.type === "ice-candidate" && data.candidate) {
              await peerConnection.addIceCandidate(data.candidate);
            }
          } catch (error) {
            onError?.("startup");
          }
        };

        ws.onerror = () => {
          isConnecting.current = false;
          onError?.("startup");
        };

        ws.onclose = () => {
          isConnecting.current = false;
          if (
            playbackEnabled &&
            connectionAttempts.current < maxReconnectAttempts
          ) {
            reconnectRef.current?.();
          }
        };

        // ICE connection state monitoring for ultra-low latency
        peerConnection.oniceconnectionstatechange = () => {
          const state = peerConnection.iceConnectionState;

          if (state === "failed" || state === "disconnected") {
            if (streamingPriority === "ultra-low-latency" && playbackEnabled) {
              // Immediate reconnection for ultra-low latency
              reconnectRef.current?.();
            } else if (state === "failed") {
              onError?.("stalled");
            }
          } else if (state === "connected" || state === "completed") {
            isConnecting.current = false;
            connectionAttempts.current = 0;
          }
        };

        // Connection state monitoring
        peerConnection.onconnectionstatechange = () => {
          const state = peerConnection.connectionState;

          if (state === "failed" || state === "closed") {
            isConnecting.current = false;
            if (
              playbackEnabled &&
              connectionAttempts.current < maxReconnectAttempts
            ) {
              reconnectRef.current?.();
            }
          }
        };
      } catch (error) {
        isConnecting.current = false;
        onError?.("startup");
      }
    },
    [wsURL, playbackEnabled, maxReconnectAttempts, streamingPriority, onError],
  );

  const reconnect = useCallback(() => {
    if (
      isConnecting.current ||
      connectionAttempts.current >= maxReconnectAttempts
    ) {
      if (
        connectionAttempts.current >= maxReconnectAttempts &&
        streamingPriority !== "ultra-low-latency"
      ) {
        onError?.("stalled");
      }
      return;
    }

    connectionAttempts.current += 1;

    // Clean up existing connections before reconnecting
    cleanupConnection();

    // Faster reconnection for ultra-low-latency mode
    const reconnectDelay =
      streamingPriority === "ultra-low-latency" ? 1000 : 3000;

    reconnectTimeoutRef.current = setTimeout(() => {
      if (playbackEnabled && !isConnecting.current) {
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
    connect,
    cleanupConnection,
  ]);

  // Update the reconnect ref whenever reconnect changes
  useEffect(() => {
    reconnectRef.current = reconnect;
  }, [reconnect]);

  useEffect(() => {
    if (!videoRef.current || !playbackEnabled) {
      return;
    }

    // Reset connection attempts when starting fresh
    connectionAttempts.current = 0;

    const aPc = PeerConnection(
      microphoneEnabled ? "video+audio+microphone" : "video+audio",
    );
    connect(aPc);

    return () => {
      cleanupConnection();
      connectionAttempts.current = 0;
    };
  }, [
    camera,
    connect,
    PeerConnection,
    playbackEnabled,
    microphoneEnabled,
    cleanupConnection,
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
      if (
        document.visibilityState === "visible" &&
        playbackEnabled &&
        !isConnecting.current
      ) {
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
            : 0; // in kBps

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
