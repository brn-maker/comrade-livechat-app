"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { FILTER_REGISTRY } from "@/lib/ar/filters";

// ── Constants ────────────────────────────────────────────────────────────────

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;
const CANVAS_FPS = 30;

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseARStreamOptions {
  /** Camera resolution width (default 640) */
  width?: number;
  /** Camera resolution height (default 480) */
  height?: number;
}

export interface UseARStreamReturn {
  /** The processed MediaStream – feed to <video> or WebRTC peer */
  stream: MediaStream | null;
  /** Currently active filter id */
  activeFilter: string;
  /** Switch to a different AR filter (calls replaceTrack on registered senders) */
  setFilter: (filterId: string) => void;
  /** Register an RTCRtpSender so replaceTrack() is called on filter change */
  registerSender: (sender: RTCRtpSender) => void;
  /** Unregister a sender (e.g. on peer disconnect) */
  unregisterSender: (sender: RTCRtpSender) => void;
  /** Is the landmarker model still loading? */
  isLoading: boolean;
  /** Any error during initialisation */
  error: Error | null;
  /** Hidden canvas ref — attach to a <canvas> for debug / PiP preview */
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useARStream(
  options?: UseARStreamOptions,
): UseARStreamReturn {
  const width = options?.width ?? DEFAULT_WIDTH;
  const height = options?.height ?? DEFAULT_HEIGHT;

  // ── React state (drives UI) ──────────────────────────────────────────────
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [activeFilter, setActiveFilter] = useState("none");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // ── Refs (mutable, no re-renders) ────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafIdRef = useRef<number>(0);
  const activeFilterRef = useRef("none"); // mirrors state for rAF access
  const sendersRef = useRef<Set<RTCRtpSender>>(new Set());
  const rawStreamRef = useRef<MediaStream | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const lastTimestampRef = useRef<number>(-1);

  // ── Sender registration ──────────────────────────────────────────────────

  const registerSender = useCallback((sender: RTCRtpSender) => {
    sendersRef.current.add(sender);
  }, []);

  const unregisterSender = useCallback((sender: RTCRtpSender) => {
    sendersRef.current.delete(sender);
  }, []);

  // ── Filter switching with replaceTrack ───────────────────────────────────

  const setFilter = useCallback((filterId: string) => {
    if (!FILTER_REGISTRY.has(filterId)) {
      console.warn(`[useARStream] Unknown filter: "${filterId}"`);
      return;
    }

    activeFilterRef.current = filterId;
    setActiveFilter(filterId);

    // For mid-call switching we explicitly replace the outgoing track via
    // RTCRtpSender.replaceTrack(). We re-capture from the same canvas so
    // the sender is updated without renegotiation.
    const canvas = canvasRef.current;
    const newCanvasStream = canvas
      ? canvas.captureStream(CANVAS_FPS)
      : null;
    if (newCanvasStream) {
      canvasStreamRef.current = newCanvasStream;
      setStream(newCanvasStream);
    }

    const track =
      newCanvasStream?.getVideoTracks()[0] ??
      canvasStreamRef.current?.getVideoTracks()[0] ??
      null;
    if (track) {
      sendersRef.current.forEach((sender) => {
        sender.replaceTrack(track).catch((err) => {
          console.error("[useARStream] replaceTrack failed:", err);
        });
      });
    }
  }, []);

  // ── Initialisation (runs once on mount) ──────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Acquire camera ──────────────────────────────────────────────
        const rawStream = await navigator.mediaDevices.getUserMedia({
          video: { width, height, facingMode: "user" },
          audio: false,
        });

        if (cancelled) {
          rawStream.getTracks().forEach((t) => t.stop());
          return;
        }

        rawStreamRef.current = rawStream;

        // 2. Hidden <video> to feed frames ───────────────────────────────
        const video = document.createElement("video");
        video.srcObject = rawStream;
        video.muted = true;
        video.playsInline = true;
        // Wait for metadata so we know the real resolution
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => {
            video.play();
            resolve();
          };
        });

        if (cancelled) {
          rawStream.getTracks().forEach((t) => t.stop());
          return;
        }

        videoRef.current = video;

        // Use actual video dimensions (camera may negotiate differently)
        const vw = video.videoWidth || width;
        const vh = video.videoHeight || height;

        // 3. Setup canvas ────────────────────────────────────────────────
        let canvas = canvasRef.current;
        if (!canvas) {
          canvas = document.createElement("canvas");
          // Not attached to the DOM, but explicitly mark as hidden for safety.
          canvas.style.display = "none";
          canvasRef.current = canvas;
        }
        canvas.width = vw;
        canvas.height = vh;

        // Validate canvas dimensions
        if (canvas.width === 0 || canvas.height === 0) {
          throw new Error("Canvas has invalid dimensions (width or height is 0).");
        }

        const canvasStream = canvas.captureStream(CANVAS_FPS);
        canvasStreamRef.current = canvasStream;
        setStream(canvasStream);

        // 4. Initialise MediaPipe FaceLandmarker ─────────────────────────
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);

        if (cancelled) {
          rawStream.getTracks().forEach((t) => t.stop());
          return;
        }

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });

        if (cancelled) {
          landmarker.close();
          rawStream.getTracks().forEach((t) => t.stop());
          return;
        }

        landmarkerRef.current = landmarker;
        setIsLoading(false);

        // 5. Start the render loop ───────────────────────────────────────
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error(
            "Failed to get 2D canvas context. Your browser may not support it or memory is low.",
          );
        }

        function renderFrame() {
          if (cancelled) return;
          if (!ctx) return;

          // Draw raw video frame first
          ctx.drawImage(video, 0, 0, vw, vh);

          // Run face detection — timestamps must be strictly increasing
          const now = performance.now();
          if (now > lastTimestampRef.current && landmarkerRef.current) {
            lastTimestampRef.current = now;

            try {
              const result = landmarkerRef.current.detectForVideo(video, now);
              const landmarks = result.faceLandmarks[0] ?? [];

              // Apply active filter
              const filter = FILTER_REGISTRY.get(activeFilterRef.current);
              if (filter) {
                filter.render(ctx, video, landmarks, vw, vh);
              }
            } catch {
              // Detection can fail on rare frames — silently skip
            }
          }

          rafIdRef.current = requestAnimationFrame(renderFrame);
        }

        rafIdRef.current = requestAnimationFrame(renderFrame);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err : new Error(String(err)),
          );
          setIsLoading(false);
        }
      }
    }

    init();

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      cancelled = true;

      // Stop rAF loop
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      // Close MediaPipe landmarker
      landmarkerRef.current?.close();
      landmarkerRef.current = null;

      // Stop camera tracks
      rawStreamRef.current?.getTracks().forEach((t) => t.stop());
      rawStreamRef.current = null;

      // Stop canvas stream tracks
      canvasStreamRef.current?.getTracks().forEach((t) => t.stop());
      canvasStreamRef.current = null;

      // Clear senders
      sendersRef.current.clear();
    };
  }, [width, height]);

  return {
    stream,
    activeFilter,
    setFilter,
    registerSender,
    unregisterSender,
    isLoading,
    error,
    canvasRef,
  };
}
