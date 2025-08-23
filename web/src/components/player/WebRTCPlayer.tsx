import { baseUrl } from "@/api/baseUrl";
import { LivePlayerError, PlayerStatsType } from "@/types/live";
import ActivityIndicator from "../indicators/activity-indicator";
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
  streamIndex: _streamIndex = 0,
}: WebRtcPlayerProps) {
  // metadata

  const webrtcURL = useMemo(() => {
    return `${baseUrl}api/go2rtc/webrtc?src=${camera}`;
  }, [camera]);

  // camera states

  const pcRef = useRef<RTCPeerConnection | undefined>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [bufferTimeout, setBufferTimeout] = useState<NodeJS.Timeout>();
  const videoLoadTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const isConnecting = useRef<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [connectionState, setConnectionState] = useState<string>("new");
  const wasHiddenRef = useRef(false);

  // Stable refs for callbacks to prevent reconnections
  const onErrorRef = useRef(onError);
  const onPlayingRef = useRef(onPlaying);
  const microphoneEnabledRef = useRef(microphoneEnabled);

  // Update refs when props change
  useEffect(() => {
    onErrorRef.current = onError;
    onPlayingRef.current = onPlaying;
    microphoneEnabledRef.current = microphoneEnabled;
  }, [onError, onPlaying, microphoneEnabled]);

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
        // Always optimize for ultra-low latency
        iceCandidatePoolSize: 10,
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

  const cleanupConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = undefined;
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

        // Create offer for WHEP (WebRTC-HTTP Egress Protocol)
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Use HTTP POST to go2rtc's WebRTC API instead of WebSocket
        const response = await fetch(webrtcURL, {
          method: "POST",
          headers: {
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const answerSdp = await response.text();
        const answer = new RTCSessionDescription({
          type: "answer",
          sdp: answerSdp,
        });

        await peerConnection.setRemoteDescription(answer);

        // ICE connection state monitoring
        peerConnection.oniceconnectionstatechange = () => {
          const state = peerConnection.iceConnectionState;
          setConnectionState(state);

          if (state === "connected" || state === "completed") {
            isConnecting.current = false;
            onPlayingRef.current?.(); // Notify that video is playing
          } else if (state === "failed") {
            isConnecting.current = false;
            if (playbackEnabled) {
              // Immediate reconnection for fastest comeback
              if (playbackEnabled) {
                const newPc = PeerConnection(
                  microphoneEnabledRef.current
                    ? "video+audio+microphone"
                    : "video+audio",
                );
                connect(newPc);
              }
            } else {
              onErrorRef.current?.("stalled");
            }
          }
        };

        // Connection state monitoring
        peerConnection.onconnectionstatechange = () => {
          const state = peerConnection.connectionState;

          if (state === "failed" || state === "closed") {
            isConnecting.current = false;
          }
        };
      } catch (error) {
        isConnecting.current = false;
        onErrorRef.current?.("startup");
      }
    },
    [webrtcURL, playbackEnabled, PeerConnection],
  );

  const startConnection = useCallback(() => {
    if (isConnecting.current || !playbackEnabled) {
      return;
    }

    setIsLoading(true);
    setConnectionState("connecting");
    cleanupConnection();

    const pc = PeerConnection(
      microphoneEnabledRef.current ? "video+audio+microphone" : "video+audio",
    );
    connect(pc);
  }, [playbackEnabled, PeerConnection, connect, cleanupConnection]);

  // Main connection effect - only reconnect when camera or playback state changes
  useEffect(() => {
    if (!videoRef.current || !playbackEnabled) {
      return;
    }

    startConnection();

    return () => {
      cleanupConnection();
    };
  }, [camera, playbackEnabled, startConnection, cleanupConnection]);

  // ios compat

  const [iOSCompatControls, setiOSCompatControls] = useState(false);

  // control pip

  useEffect(() => {
    if (!videoRef.current || !pip) {
      return;
    }

    videoRef.current.requestPictureInPicture();
  }, [pip, videoRef]);

  // Immediate reconnection when page becomes visible (always ultra-low-latency mode)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasHiddenRef.current = true;
      } else if (
        document.visibilityState === "visible" &&
        wasHiddenRef.current &&
        playbackEnabled
      ) {
        wasHiddenRef.current = false;

        // Only reconnect if we don't have an active connection
        const currentPc = pcRef.current;
        const isConnectionActive =
          currentPc &&
          (currentPc.iceConnectionState === "connected" ||
            currentPc.iceConnectionState === "completed");

        // Check if video is actually playing
        const isVideoPlaying =
          videoRef.current &&
          !videoRef.current.paused &&
          !videoRef.current.ended &&
          videoRef.current.readyState > 2;

        // Only reconnect if connection is broken AND video isn't playing AND we were actually hidden
        if (!isConnectionActive && !isVideoPlaying && !isConnecting.current) {
          // Clear any existing reconnect timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = undefined;
          }

          // Immediate reconnection for faster comeback
          if (playbackEnabled && !isConnecting.current) {
            startConnection();
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [playbackEnabled, startConnection, cleanupConnection]);

  // control volume

  useEffect(() => {
    if (!videoRef.current || volume == undefined) {
      return;
    }

    videoRef.current.volume = volume;
  }, [volume, videoRef]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    const videoTimeout = videoLoadTimeoutRef.current;
    const reconnectTimeout = reconnectTimeoutRef.current;

    return () => {
      if (videoTimeout) {
        clearTimeout(videoTimeout);
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  const handleLoadedData = () => {
    if (videoLoadTimeoutRef.current) {
      clearTimeout(videoLoadTimeoutRef.current);
    }
    setIsLoading(false);
    setConnectionState("connected");
    isConnecting.current = false;
    onPlayingRef.current?.();
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
    <div className="relative size-full">
      {isLoading && playbackEnabled && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center shadow-sm dark:border-blue-800 dark:bg-blue-950">
            <div className="flex items-center justify-center gap-2">
              <ActivityIndicator className="h-4 w-4" />
              <div className="text-sm font-medium text-blue-800 dark:text-blue-200">
                {connectionState === "connecting"
                  ? "Connecting..."
                  : "Loading..."}
              </div>
            </div>
          </div>
        </div>
      )}
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
                        pcRef.current != undefined &&
                        playbackEnabled
                      ) {
                        // Always ultra-low-latency mode - don't error on stalls
                        return;
                      }
                    },
                    5000, // Faster timeout for immediate comeback
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
    </div>
  );
}
