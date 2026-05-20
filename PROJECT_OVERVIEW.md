# Comrade Livechat App — Project Overview

## Project Summary

`comrade-livechat-app` is a modern live video chat application built with Next.js 16, React 19, and Supabase authentication. It features:

- Real-time video matching via a dedicated Socket.io server
- WebRTC-based live video conversations
- Face-tracking AR filters powered by MediaPipe Tasks Vision
- Preference-based matching using gender and seeking criteria
- User authentication, signup, profile completion, and password reset flows
- Basic event analytics via PostHog

The application is split into a frontend Next.js app and a backend matching server that uses Redis/Upstash and Supabase service authentication.

---

## Architecture and Key Components

### Frontend

The frontend is a Next.js app located in `src/app/`.

- `src/app/page.tsx` renders the landing experience.
- `src/app/chat/page.tsx` protects the chat route and fetches profile data from Supabase.
- `src/components/landing/LandingExperience.tsx` contains the login/signup modal flow, profile declaration, and marketing landing page.
- `src/components/chat/ChatRoom.tsx` runs the live chat experience, WebRTC handling, socket signalling, and AR previews.
- `src/hooks/useARStream.ts` manages camera capture, MediaPipe face landmark detection, AR filter rendering, and canvas stream output.
- `src/lib/socket.ts` creates a shared Socket.io client for the chat application.
- `src/lib/ar/filters.ts` defines the AR filter registry and several built-in filters.
- `src/lib/supabase/client.ts` creates browser Supabase clients for frontend auth and data access.
- `src/app/auth/reset-password/page.tsx` provides the reset password landing page.
- `src/app/providers.tsx` initializes PostHog for analytics pageview capture.

### Backend / Matching Server

The backend server is in `server/src/` and runs independently from the Next.js front-end.

- `server/src/index.js` starts a Socket.io server to manage matching, signalling, and queue lifecycle.
- `server/src/queues.js` provides queue key generation and matching queue logic for gender/seek preferences.
- The backend uses Upstash Redis for queue storage and rate limiting via `@upstash/ratelimit`.
- Supabase is used server-side for authentication validation and optional match logging.

### Database

- Supabase is the identity and profile store.
- The project includes Supabase migration files in `supabase/migrations/`.
- Profiles are stored in a `profiles` table and include `id`, `gender`, `seeking`, and `birth_year`.

---

## Feature Breakdown

### User Experience

- **Signup and Sign-in**: Users can sign up with email and password, then sign in.
- **Profile declaration**: After auth, users declare their gender and seeking preferences.
- **Live chat matching**: Users are matched based on declared gender and expressed seeking preferences.
- **Password reset**: Built-in flow to request reset email and update password.
- **Mobile-aware UI**: The chat experience adapts video resolution for mobile devices.

### Matching Logic

- The server keeps queue keys in Redis with `queue:{declared}_seeking_{seeking}`.
- When a user joins, the server attempts to match across complementary queues.
- Matching is performed atomically via Redis Lua script with FIFO dequeuing.
- The first matched user becomes the WebRTC initiator, and the other becomes responder.
- The server handles disconnects, rematch requests, and queue cleanup.

### Real-time Video / WebRTC

- `ChatRoom.tsx` manages a `RTCPeerConnection` and sends/receives tracks.
- It uses a local camera stream as input and attaches a remote stream to the remote video element.
- Signalling events are exchanged through Socket.io using `signal` and `match_found` events.
- The application supports rematch workflows and partner disconnect handling.

### AR Filters

- Uses `@mediapipe/tasks-vision` and a face landmarker model.
- A hidden canvas renders the camera feed plus AR overlays.
- Filters available in `src/lib/ar/filters.ts` include:
  - `none`: passthrough video
  - `beauty`: soft-glow blur overlay
  - `mask`: neon wireframe face overlay
  - `eyes`: cartoon eye rendering
- Filter changes replace the outgoing WebRTC track via `RTCRtpSender.replaceTrack()`.

---

## Tech Stack

- **Frontend**
  - Next.js 16
  - React 19
  - TypeScript
  - Tailwind CSS v4
  - PostHog for analytics
  - Supabase client auth
  - Socket.io client
  - MediaPipe Tasks Vision for AR face detection
  - WebRTC native browser APIs

- **Backend**
  - Node.js with Socket.io server
  - Upstash Redis for queue storage and rate limiting
  - Supabase service role key for auth verification and logging
  - Zod for payload validation

---

## Important Files

- `package.json` — frontend dependencies and scripts
- `src/app/page.tsx` — landing page entrypoint
- `src/app/chat/page.tsx` — authenticated chat route
- `src/components/chat/ChatRoom.tsx` — core live chat UI and WebRTC logic
- `src/hooks/useARStream.ts` — camera + AR filter processing
- `src/lib/ar/filters.ts` — filter definitions
- `src/lib/socket.ts` — Socket.io client wrapper
- `server/src/index.js` — matching server main logic
- `server/src/queues.js` — queue key generation and matching helpers
- `supabase/migrations/` — database schema migrations

---

## Environment Variables

### Frontend `.env` / `next.config.ts`

- `NEXT_PUBLIC_SOCKET_URL` — URL of the socket server (defaults to `http://localhost:3001`)
- `NEXT_PUBLIC_POSTHOG_KEY` — PostHog project key
- `NEXT_PUBLIC_POSTHOG_HOST` — PostHog host URL

### Backend `server/.env`

- `PORT` — server port (default `3001`)
- `CORS_ORIGIN` — allowed origins for Socket.io CORS
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key for server auth verification
- `UPSTASH_REDIS_REST_URL` — Upstash Redis REST endpoint
- `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis auth token

---

## Running the Project

### Frontend

- Install dependencies in the root workspace
  ```bash
  npm install
  ```
- Start the frontend
  ```bash
  npm run dev
  ```

### Backend

- From `server/`, install dependencies and start the matching server
  ```bash
  cd server
  npm install
  node src/index.js
  ```

> The frontend expects the socket server to be reachable at `NEXT_PUBLIC_SOCKET_URL`.

---

## Notes and Observations

- The repo currently includes the default `README.md` from a fresh Next.js scaffold.
- The actual project extends that scaffold with a custom auth-driven landing page and a live matching/video chat experience.
- The Socket.io backend is designed for preference-based matching with rate limiting and auth verification.
- The AR filter pipeline is built to work in-browser using MediaPipe, custom canvas rendering, and WebRTC track replacement.

---

## Suggested Next Improvements

- Add a dedicated `README.md` or `docs/` folder with setup, architecture, and deployment docs.
- Confirm Supabase migrations include the required `profiles` table fields and any RPC functions used by the server.
- Add frontend error handling for socket connection failures and WebRTC permission denials.
- Add tests for matching queue behavior and filter rendering fallback logic.
