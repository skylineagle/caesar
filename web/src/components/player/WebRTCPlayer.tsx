/* eslint-disable no-console */
import { baseUrl } from "@/api/baseUrl";
import { LivePlayerError, PlayerStatsType } from "@/types/live";
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
};

export default function WebRtcPlayer({
  className,
  camera,
  playbackEnabled = true,
  audioEnabled = false,
  volume,
  microphoneEnabled = false,
  pip = false,
  getStats = false,
  setStats,
  onPlaying,
  onError,
}: WebRtcPlayerProps) {
  // metadata

  const wsURL = useMemo(() => {
    return `${baseUrl.replace(/^http/, "ws")}live/webrtc/api/ws?src=${camera}`;
  }, [camera]);

  // camera states

  const pcRef = useRef<RTCPeerConnection | undefined>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<string>("new");
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelayRef = useRef(1000);

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
        iceCandidatePoolSize: 10,
        iceTransportPolicy: "all",
        rtcpMuxPolicy: "require",
      });

      // Monitor connection state changes
      pc.addEventListener("connectionstatechange", () => {
        setConnectionState(pc.connectionState);
        if (pc.connectionState === "connected") {
          reconnectAttemptsRef.current = 0;
          reconnectDelayRef.current = 1000;
          onPlaying?.();
        } else if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          onError?.("startup");
        }
      });

      // Monitor ICE connection state
      pc.addEventListener("iceconnectionstatechange", () => {
        if (pc.iceConnectionState === "failed") {
          onError?.("startup");
        }
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
    [videoRef, onPlaying, onError],
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

  const connect = useCallback(
    async (aPc: Promise<RTCPeerConnection | undefined>) => {
      if (!aPc) {
        return;
      }

      pcRef.current = await aPc;

      // Close existing WebSocket if any
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const ws = new WebSocket(wsURL);
      wsRef.current = ws;

      let offerSent = false;

      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (!offerSent) {
          console.warn("WebSocket connection timeout for", camera);
          ws.close();
          onError?.("startup");
        }
      }, 10000);

      ws.addEventListener("open", () => {
        clearTimeout(connectionTimeout);

        pcRef.current?.addEventListener("icecandidate", (ev) => {
          if (!ev.candidate) return;
          const msg = {
            type: "webrtc/candidate",
            value: ev.candidate.candidate,
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
          }
        });

        pcRef.current
          ?.createOffer()
          .then((offer) => pcRef.current?.setLocalDescription(offer))
          .then(() => {
            const msg = {
              type: "webrtc/offer",
              value: pcRef.current?.localDescription?.sdp,
            };
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(msg));
              offerSent = true;
            }
          })
          .catch(() => {
            onError?.("startup");
          });
      });

      ws.addEventListener("message", (ev) => {
        try {
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
        } catch (error) {
          console.error("WebRTC message parsing error for", camera, error);
        }
      });

      ws.addEventListener("error", (error) => {
        console.error("WebSocket error for", camera, error);
        clearTimeout(connectionTimeout);

        onError?.("startup");
      });

      ws.addEventListener("close", (event) => {
        console.log(
          "WebSocket closed for",
          camera,
          "code:",
          event.code,
          "reason:",
          event.reason,
        );
        clearTimeout(connectionTimeout);

        // Only trigger error if not a normal closure and connection is still active
        if (
          event.code !== 1000 &&
          pcRef.current?.connectionState !== "closed"
        ) {
          onError?.("startup");
        }
      });
    },
    [wsURL, onError, camera],
  );

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = undefined;
    }

    setConnectionState("new");
  }, []);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.log("Max reconnection attempts reached for", camera);
      onError?.("startup");
      return;
    }

    reconnectAttemptsRef.current++;
    const delay = Math.min(
      reconnectDelayRef.current * Math.pow(2, reconnectAttemptsRef.current - 1),
      10000,
    );

    console.log(
      `Attempting reconnection ${reconnectAttemptsRef.current}/${maxReconnectAttempts} for ${camera} in ${delay}ms`,
    );

    reconnectTimeoutRef.current = setTimeout(() => {
      if (playbackEnabled) {
        const aPc = PeerConnection(
          microphoneEnabled ? "video+audio+microphone" : "video+audio",
        );
        connect(aPc);
      }
    }, delay);
  }, [
    playbackEnabled,
    microphoneEnabled,
    PeerConnection,
    connect,
    onError,
    camera,
  ]);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    if (!playbackEnabled) {
      disconnect();
      return;
    }

    // Only reconnect if we don't have an active connection
    if (!pcRef.current || pcRef.current.connectionState === "closed") {
      const aPc = PeerConnection(
        microphoneEnabled ? "video+audio+microphone" : "video+audio",
      );
      connect(aPc);
    }

    return () => {
      // Only disconnect on unmount, not on every effect run
      if (!playbackEnabled) {
        disconnect();
      }
    };
  }, [
    camera,
    connect,
    PeerConnection,
    playbackEnabled,
    microphoneEnabled,
    disconnect,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Auto-reconnect on connection failures
  useEffect(() => {
    if (connectionState === "failed" || connectionState === "disconnected") {
      if (
        playbackEnabled &&
        reconnectAttemptsRef.current < maxReconnectAttempts
      ) {
        attemptReconnect();
      }
    }
  }, [connectionState, playbackEnabled, attemptReconnect]);

  // ios compat

  // control pip

  useEffect(() => {
    if (!videoRef.current || !pip) {
      return;
    }

    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else {
      videoRef.current.requestPictureInPicture();
    }
  }, [pip]);

  // volume control

  useEffect(() => {
    if (!videoRef.current || volume === undefined) {
      return;
    }

    videoRef.current.volume = volume;
  }, [volume]);

  // stats collection

  useEffect(() => {
    if (!getStats || !setStats || !pcRef.current) {
      return;
    }

    const statsInterval = setInterval(async () => {
      try {
        const stats = await pcRef.current!.getStats();
        let totalBytesReceived = 0;
        let totalFramesDecoded = 0;
        let totalFramesDropped = 0;

        stats.forEach((report) => {
          if (report.type === "inbound-rtp" && report.mediaType === "video") {
            totalBytesReceived += report.bytesReceived || 0;
            totalFramesDecoded += report.framesDecoded || 0;
            totalFramesDropped += report.framesDropped || 0;
          }
        });

        setStats({
          streamType: "webrtc",
          bandwidth: totalBytesReceived,
          latency: undefined,
          totalFrames: totalFramesDecoded,
          droppedFrames: totalFramesDropped,
          decodedFrames: totalFramesDecoded,
          droppedFrameRate:
            totalFramesDropped / Math.max(totalFramesDecoded, 1),
        });
      } catch (error) {
        console.error("Error collecting WebRTC stats:", error);
      }
    }, 1000);

    return () => clearInterval(statsInterval);
  }, [getStats, setStats]);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      playsInline
      muted={!audioEnabled}
      // Optimize for better performance with frame dropping
      preload="metadata"
      onLoadedMetadata={() => {
        if (videoRef.current) {
          videoRef.current.play().catch(() => {
            // Ignore autoplay errors
          });
        }
      }}
      onPlaying={() => {
        onPlaying?.();
      }}
      onError={() => {
        onError?.("startup");
      }}
    />
  );
}
