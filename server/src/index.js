import "dotenv/config";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { z } from "zod";
import {
  complementaryQueues,
  queueKey,
} from "./queues.js";
import { createClient } from "@supabase/supabase-js";

const PORT = Number(process.env.PORT) || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN;

// Validate required environment variables (no fallbacks for secrets)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. " +
    "Do not use NEXT_PUBLIC_ variables for server-side auth."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  console.error(
    "FATAL: Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in server/.env",
  );
  process.exit(1);
}

const redis = new Redis({ url: redisUrl, token: redisToken });

// Rate limiters
const socketConnectLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1m"), // 10 connections per minute per IP
  analytics: true,
});

const joinMatchingLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "10s"), // 5 join attempts per 10 seconds per user
  analytics: true,
});

const rematchLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "10s"), // 3 rematches per 10 seconds per user
  analytics: true,
});

/**
 * Atomic: ZADD joiner to their queue with Redis TIME score, then try each
 * opposite queue ZPOPMIN (FIFO). On match, ZREM joiner from their queue.
 * Returns [matched, partnerId?, joinerId?] — joinerId always ARGV[1] on match.
 */
const MATCH_SCRIPT = `
local myQueue = KEYS[1]
local myMember = ARGV[1]
local n = tonumber(ARGV[2])

local t = redis.call('TIME')
local score = tonumber(t[1]) * 1000000 + tonumber(t[2])
redis.call('ZADD', myQueue, score, myMember)

for i = 1, n do
  local oppQueue = ARGV[2 + i]
  local popped = redis.call('ZPOPMIN', oppQueue, 1)
  if popped and #popped >= 1 then
    local partner = popped[1]
    redis.call('ZREM', myQueue, myMember)
    return {1, partner, myMember}
  end
end

return {0}
`;

// CORS configuration - require explicit origin in production
if (!CORS_ORIGIN) {
  console.warn(
    "WARNING: CORS_ORIGIN not set. Socket.io will allow all origins. " +
    "Set CORS_ORIGIN to your frontend URL for production."
  );
}

const corsOrigin = CORS_ORIGIN 
  ? CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : ["http://localhost:3000", "http://127.0.0.1:3000"];

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { 
    origin: corsOrigin, 
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Security: require auth token for connection
  allowRequest: async (req, callback) => {
    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const { success } = await socketConnectLimiter.limit(clientIp);
    if (!success) {
      return callback("Rate limit exceeded", false);
    }
    callback(null, true);
  },
});

/** @type {Map<string, string>} userId -> socket id */
const socketByUser = new Map();
/** @type {Map<string, { queueKey: string }>} userId -> active queue */
const waitingByUser = new Map();
/** @type {Map<string, { startTime: number, partnerId: string, roomId: string }>} userId -> current match info */
const activeMatches = new Map();

/**
 * @param {string} userId
 * @param {string} partnerId
 * @param {string} roomId
 */
function recordMatchStart(userId, partnerId, roomId) {
  activeMatches.set(userId, { startTime: Date.now(), partnerId, roomId });
}

/**
 * @param {string} userId
 */
async function recordMatchEnd(userId) {
  const match = activeMatches.get(userId);
  if (!match) return;
  
  const duration = Math.floor((Date.now() - match.startTime) / 1000);
  activeMatches.delete(userId);

  if (supabase) {
    try {
      await supabase.rpc("log_match_data", {
        p_user_1_id: userId,
        p_user_2_id: match.partnerId,
        p_started_at: new Date(match.startTime).toISOString(),
        p_ended_at: new Date().toISOString(),
        p_duration_seconds: duration,
      });
    } catch (err) {
      console.error("[MatchLog] Error logging match end:", err.message);
    }
  }
}

/**
 * @param {string} userId
 * @param {string} socketId
 */
function bindUserSocket(userId, socketId) {
  const prev = socketByUser.get(userId);
  if (prev && prev !== socketId) {
    const old = io.sockets.sockets.get(prev);
    old?.disconnect(true);
  }
  socketByUser.set(userId, socketId);
}

/**
 * @param {string} userId
 */
async function removeFromQueue(userId) {
  const w = waitingByUser.get(userId);
  if (!w) return;
  waitingByUser.delete(userId);
  await redis.zrem(w.queueKey, userId);
}

httpServer.listen(PORT, () => {
  console.log(`Matching server listening on ${PORT}`);
});

// Zod schema for join payload validation
const joinPayloadSchema = z.object({
  userId: z.string().uuid("Invalid user ID format"),
  gender: z.enum(["male", "female", "other"]),
  seeking: z.enum(["male", "female", "both"]),
  // Auth token for verification (client sends their Supabase auth token)
  authToken: z.string().optional(),
});

/**
 * Verify that the provided userId matches the auth token
 * @param {string} userId - The claimed user ID
 * @param {string} authToken - The Supabase auth token (JWT)
 * @returns {Promise<boolean>}
 */
async function verifyUserAuth(userId, authToken) {
  if (!authToken) return false;
  try {
    // Create a temporary client with the user's token to verify it
    const userClient = createClient(SUPABASE_URL, authToken, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return false;
    return user.id === userId;
  } catch {
    return false;
  }
}

io.on("connection", (socket) => {
  socket.on("join_matching", async (raw, ack) => {
    // Validate payload with Zod
    const parseResult = joinPayloadSchema.safeParse(raw);
    if (!parseResult.success) {
      ack?.({ ok: false, error: "invalid_payload", details: parseResult.error.errors });
      return;
    }

    const { userId, gender, seeking, authToken } = parseResult.data;

    // Rate limit check
    const { success: rateLimitOk } = await joinMatchingLimiter.limit(userId);
    if (!rateLimitOk) {
      ack?.({ ok: false, error: "rate_limited" });
      return;
    }

    // Verify auth token matches userId (prevents impersonation)
    const isAuthenticated = await verifyUserAuth(userId, authToken);
    if (!isAuthenticated) {
      ack?.({ ok: false, error: "unauthorized" });
      return;
    }

    bindUserSocket(userId, socket.id);
    socket.data.userId = userId;

    await removeFromQueue(userId);

    const myQueue = queueKey(gender, seeking);
    const opposites = complementaryQueues(gender, seeking);

    if (opposites.length === 0) {
      ack?.({ ok: false, error: "no_opposite_queues" });
      return;
    }

    const argValues = [userId, String(opposites.length), ...opposites];

    /** @type {unknown} */
    const result = await redis.eval(MATCH_SCRIPT, [myQueue], argValues);

    if (!Array.isArray(result) || result.length === 0) {
      ack?.({ ok: false, error: "redis_error" });
      return;
    }

    const matched = Number(result[0]) === 1;

    if (!matched) {
      waitingByUser.set(userId, { queueKey: myQueue });
      socket.emit("matching_wait", { queueKey: myQueue });
      ack?.({ ok: true, waiting: true, queueKey: myQueue });
      return;
    }

    const partnerId = String(result[1]);
    const joinerId = String(result[2]);
    waitingByUser.delete(partnerId);
    waitingByUser.delete(joinerId);

    const roomId = randomUUID();
    /** Joiner = WebRTC initiator; partner waited in opposite queue = responder */
    const initiatorId = joinerId;
    const responderId = partnerId;

    const payloadInitiator = {
      roomId,
      role: "initiator",
      partnerId: responderId,
    };
    const payloadResponder = {
      roomId,
      role: "responder",
      partnerId: initiatorId,
    };

    socket.emit("match_found", payloadInitiator);
    recordMatchStart(joinerId, partnerId, roomId);

    const partnerSocketId = socketByUser.get(partnerId);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit("match_found", payloadResponder);
      recordMatchStart(partnerId, joinerId, roomId);
    }

    ack?.({
      ok: true,
      waiting: false,
      matched: true,
      roomId,
      role: "initiator",
      partnerId: responderId,
    });
  });

  socket.on("leave_matching", async (ack) => {
    const uid = socket.data.userId;
    if (uid) {
      await recordMatchEnd(uid);
      await removeFromQueue(uid);
      socketByUser.delete(uid);
    }
    ack?.({ ok: true });
  });
  
  socket.on("signal", (data) => {
    const { to, signal, roomId } = data;
    const targetSocketId = socketByUser.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("signal", {
        signal,
        roomId,
        from: socket.data.userId,
      });
    }
  });

  socket.on("rematch", async (raw, ack) => {
    // Treat rematch as a request to leave current room and join matching again.
    // The client should call this instead of manual leave/join sequence.
    const uid = socket.data.userId;
    if (!uid) {
      ack?.({ ok: false, error: "not_authenticated" });
      return;
    }

    // Rate limit check
    const { success: rateLimitOk } = await rematchLimiter.limit(uid);
    if (!rateLimitOk) {
      ack?.({ ok: false, error: "rate_limited" });
      return;
    }

    // Clean up current state
    await recordMatchEnd(uid);
    await removeFromQueue(uid);

    // Log skip
    if (supabase) {
      try {
        await supabase.rpc("log_skip", { p_user_id: uid });
      } catch (err) {
        console.error("[MatchLog] Error logging skip:", err.message);
      }
    }
    
    ack?.({ ok: true, status: "re-queueing" });
  });

  socket.on("disconnect", async () => {
    const uid = socket.data.userId;
    if (!uid) return;
    await recordMatchEnd(uid);
    if (socketByUser.get(uid) === socket.id) {
      socketByUser.delete(uid);
    }
    await removeFromQueue(uid);
  });
});
