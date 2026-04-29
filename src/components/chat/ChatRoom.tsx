"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { getSocket } from "@/lib/socket";
import { useARStream } from "@/hooks/useARStream";
import { FILTER_LIST } from "@/lib/ar/filters";
import { AdSlot } from "./AdSlot";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────────

type ChatStatus = "idle" | "searching" | "connected" | "disconnected";

interface MatchPayload {
  roomId: string;
  role: "initiator" | "responder";
  partnerId: string;
}

interface ChatRoomProps {
  userId: string;
  gender: string;
  seeking: string;
}

// ── ICE servers ──────────────────────────────────────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ── Component ────────────────────────────────────────────────────────────────

export function ChatRoom({ userId, gender, seeking }: ChatRoomProps) {
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [matchInfo, setMatchInfo] = useState<MatchPayload | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  // Detect mobile on mount and get auth token
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    
    // Get auth token for socket verification
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setAuthToken(session.access_token);
      }
    });
    
    return () => window.removeEventListener("resize", checkMobile);
  }, [supabase]);

  const {
    stream: localStream,
    activeFilter,
    setFilter,
    registerSender,
    isLoading: arLoading,
    error: arError,
    canvasRef,
  } = useARStream({ width: isMobile ? 480 : 640, height: isMobile ? 360 : 480 });

  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Show local AR stream in PiP preview
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // ── WebRTC helpers ───────────────────────────────────────────────────────

  const closePeer = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const createPeer = useCallback(
    (match: MatchPayload) => {
      closePeer();

      const socket = getSocket();
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Add local tracks
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          const sender = pc.addTrack(track, localStream);
          registerSender(sender);
        });
      }

      // Handle remote tracks
      pc.ontrack = (ev) => {
        if (remoteVideoRef.current && ev.streams[0]) {
          remoteVideoRef.current.srcObject = ev.streams[0];
        }
      };

      // ICE candidates
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          socket.emit("signal", {
            roomId: match.roomId,
            to: match.partnerId,
            signal: { type: "candidate", candidate: ev.candidate },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed"
        ) {
          setStatus("disconnected");
        }
      };

      return pc;
    },
    [localStream, registerSender, closePeer],
  );

  // ── Socket lifecycle ─────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket();

    // Handle match
    const onMatch = async (payload: MatchPayload) => {
      setMatchInfo(payload);
      setStatus("connected");

      const pc = createPeer(payload);

      if (payload.role === "initiator") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("signal", {
          roomId: payload.roomId,
          to: payload.partnerId,
          signal: { type: "offer", sdp: offer },
        });
      }
    };

    // Handle signalling
    const onSignal = async (data: {
      signal: {
        type: string;
        sdp?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
      };
    }) => {
      const pc = pcRef.current;
      if (!pc) return;

      try {
        if (data.signal.type === "offer" && data.signal.sdp) {
          await pc.setRemoteDescription(
            new RTCSessionDescription(data.signal.sdp),
          );
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (matchInfo) {
            socket.emit("signal", {
              roomId: matchInfo.roomId,
              to: matchInfo.partnerId,
              signal: { type: "answer", sdp: answer },
            });
          }
        } else if (data.signal.type === "answer" && data.signal.sdp) {
          await pc.setRemoteDescription(
            new RTCSessionDescription(data.signal.sdp),
          );
        } else if (data.signal.type === "candidate" && data.signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
        }
      } catch (err) {
        console.error("[ChatRoom] Signaling error:", err);
      }
    };

    const onPartnerLeft = () => {
      closePeer();
      setStatus("disconnected");
    };

    socket.on("match_found", onMatch);
    socket.on("signal", onSignal);
    socket.on("partner_left", onPartnerLeft);

    return () => {
      socket.off("match_found", onMatch);
      socket.off("signal", onSignal);
      socket.off("partner_left", onPartnerLeft);
    };
  }, [createPeer, closePeer, matchInfo]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const startSearch = useCallback(() => {
    closePeer();
    setMatchInfo(null);
    setStatus("searching");

    const socket = getSocket();
    // Include authToken for server-side verification
    socket.emit("join_matching", { 
      userId, 
      gender, 
      seeking, 
      authToken: authToken || undefined 
    });
  }, [userId, gender, seeking, closePeer, authToken]);

  const nextMatch = useCallback(() => {
    const socket = getSocket();
    closePeer();
    setMatchInfo(null);
    setStatus("searching");

    // Emit rematch as requested
    socket.emit("rematch", (ack: any) => {
      if (ack?.ok) {
        // After server acknowledges rematch/re-queue, join again
        socket.emit("join_matching", { 
          userId, 
          gender, 
          seeking, 
          authToken: authToken || undefined 
        });
      }
    });
  }, [userId, gender, seeking, closePeer, authToken]);

  const endCall = useCallback(() => {
    const socket = getSocket();
    closePeer();
    setMatchInfo(null);
    setStatus("idle");
    socket.emit("leave_matching");
  }, [closePeer]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-stone-950 text-white overflow-hidden">
      {/* ── Top Ad Banner (728x90) ────────────────────────────────────── */}
      <div className="hidden sm:flex h-[80px] sm:h-[120px] shrink-0 items-center justify-center border-b border-white/5 bg-stone-900/20 px-4 sm:px-6">
        <AdSlot width={728} height={90} label="Top Banner" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Main Chat Area ─────────────────────────────────────────── */}
        <main className="relative flex flex-1 flex-col p-3 sm:p-6">
          <div className="relative flex-1 overflow-hidden rounded-2xl sm:rounded-[2.5rem] border border-white/10 bg-black shadow-2xl">
            {/* Remote video (large, full grid coverage) */}
            <video
              ref={remoteVideoRef}
              id="remote-video"
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />

            {/* Status overlay */}
            {status !== "connected" && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-black/80 backdrop-blur-md">
                {status === "idle" && (
                  <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
                    <div className="relative">
                      <div className="absolute inset-0 animate-pulse rounded-full bg-violet-500/20 blur-2xl" />
                      <div className="relative rounded-full bg-white/5 p-8 border border-white/10 shadow-2xl">
                        <svg className="h-12 w-12 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-center">
                      <h2 className="text-2xl font-bold tracking-tight text-white/90">Comrade Chat</h2>
                      <p className="mt-2 text-sm font-medium text-white/40">Ready to meet someone new?</p>
                    </div>
                    <button
                      type="button"
                      onClick={startSearch}
                      disabled={arLoading}
                      className="group relative flex items-center gap-3 rounded-full bg-violet-600 px-10 py-4 text-base font-bold text-white shadow-[0_0_40px_rgba(139,92,246,0.3)] transition-all hover:bg-violet-500 hover:scale-105 active:scale-95 disabled:opacity-50"
                    >
                      <span>{arLoading ? "Loading AR…" : "Start Matching"}</span>
                      <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </button>
                  </div>
                )}

                {status === "searching" && (
                  <div className="flex flex-col items-center gap-6">
                    <div className="relative flex h-24 w-24 items-center justify-center">
                      <div className="absolute inset-0 animate-ping rounded-full bg-violet-500/20" />
                      <div className="absolute inset-2 animate-ping rounded-full bg-violet-500/30 font-bold" style={{ animationDelay: '0.2s' }} />
                      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/20 border border-violet-500/40">
                        <svg className="h-8 w-8 animate-spin text-violet-300" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-xl font-semibold text-white/80 animate-pulse">Finding your match…</p>
                    <button
                      type="button"
                      onClick={endCall}
                      className="px-6 py-2 text-sm font-medium text-white/30 hover:text-white/60 transition"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {status === "disconnected" && (
                    <div className="flex flex-col items-center gap-6">
                      <div className="rounded-full bg-red-500/10 p-8 border border-red-500/20">
                        <svg className="h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </div>
                      <p className="text-lg font-medium text-white/60">Partner disconnected</p>
                      <button
                        type="button"
                        onClick={nextMatch}
                        className="rounded-full bg-violet-600 px-10 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-violet-500 active:scale-95"
                      >
                        Find Next Match
                      </button>
                    </div>
                )}
              </div>
            )}

            {/* Local PiP (top-right) */}
            <div className="absolute top-3 right-3 sm:top-6 sm:right-6 z-20 w-32 sm:w-48 aspect-video overflow-hidden rounded-xl sm:rounded-2xl border-2 border-white/20 shadow-2xl shadow-black/80 ring-1 ring-black/50 transition-transform hover:scale-105 active:scale-95 cursor-pointer group">
              <video
                ref={localVideoRef}
                id="local-video"
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover grayscale-[0.2] transition-all group-hover:grayscale-0"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
              <div className="absolute bottom-1 left-2 sm:bottom-2 sm:left-3 flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                <div className="h-1 w-1 sm:h-1.5 sm:w-1.5 animate-pulse rounded-full bg-green-500" />
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-white drop-shadow-md">Live</span>
              </div>
            </div>

            {/* Controls Bar (Floating) */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-3 bg-stone-900/80 backdrop-blur-2xl rounded-xl sm:rounded-2xl border border-white/10 shadow-2xl animate-in slide-in-from-bottom-8 duration-500">
               {/* Filter Carousel */}
              <div className="flex items-center gap-1 sm:gap-2 pr-2 sm:pr-4 border-r border-white/10 max-w-[200px] sm:max-w-[300px] overflow-x-auto scrollbar-none">
                {FILTER_LIST.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={`shrink-0 rounded-lg sm:rounded-xl px-2 sm:px-4 py-1 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${
                      activeFilter === f.id
                        ? "bg-violet-600 text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] ring-1 ring-white/20"
                        : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

               <button
                type="button"
                id="next-match-btn"
                onClick={nextMatch}
                disabled={status === "idle"}
                className="group flex flex-col items-center gap-1 px-4 py-1 text-white/70 hover:text-white transition-all disabled:opacity-20"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 transition-colors group-hover:bg-violet-600">
                   <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z" />
                  </svg>
                </div>
                <span className="text-[10px] font-black uppercase tracking-tighter">Next</span>
              </button>

              <button
                type="button"
                id="end-call-btn"
                onClick={endCall}
                disabled={status === "idle"}
                className="group flex flex-col items-center gap-1 px-4 py-1 text-red-400 hover:text-red-300 transition-all disabled:opacity-20"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-400/10 transition-colors group-hover:bg-red-400 group-hover:text-white">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </div>
                <span className="text-[10px] font-black uppercase tracking-tighter">End</span>
              </button>
            </div>
          </div>

          <canvas ref={canvasRef} className="hidden" />
          {arError && (
            <div className="absolute left-10 top-10 z-50 rounded-2xl bg-red-500/90 px-4 py-3 text-xs font-bold text-white shadow-2xl backdrop-blur-xl border border-white/20">
              Camera Error: {arError.message}
            </div>
          )}
        </main>

        {/* ── Sidebar (300x250 Ad Slot) ─────────────────────────────────── */}
        <aside className="hidden lg:flex w-full lg:w-[380px] shrink-0 flex-col items-center gap-8 border-l border-white/5 bg-stone-900/10 p-8">
          <div className="flex flex-col items-center gap-2">
             <div className="h-px w-12 bg-violet-500/50" />
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Sponsored</p>
          </div>
          
          <AdSlot width={300} height={250} label="Sidebar Ad" />

          {/* Premium Upsell Card */}
          <div className="w-full relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 p-6 border border-white/10">
            <div className="absolute -top-10 -right-10 h-32 w-32 bg-violet-500/20 blur-3xl" />
            <div className="relative z-10">
              <h3 className="text-lg font-black tracking-tight">Comrade Pro</h3>
              <p className="mt-2 text-xs leading-relaxed text-white/50">Unlock premium AR filters and high-priority matching today.</p>
              <button className="mt-6 w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-[0.98]">
                Upgrade Now
              </button>
            </div>
          </div>

          <div className="mt-auto text-center">
            <p className="text-[10px] font-medium text-white/10 italic">Your privacy is our priority.<br/>Video is processed locally on your device.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
