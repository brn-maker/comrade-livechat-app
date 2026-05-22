<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:vercel-agent-rules -->
# Vercel API Key

The Vercel API key for the **comrade-livechat-app** project is stored in
`.env.local` as `VERCEL_API_KEY`.

Always use this key when interacting with the Vercel REST API to manage
deployments, environment variables, or any other project operations for this
repository. Never hard-code it into source files.
<!-- END:vercel-agent-rules -->

<!-- BEGIN:adsterra-agent-rules -->
# Adsterra Ad Key

The Adsterra publisher key for ad units is stored in `.env.local` as
`NEXT_PUBLIC_ADSTERRA_KEY`.

This key is used by the `AdSlot` component in `src/components/chat/ChatRoom.tsx`
for all ad placements:
- Top banner (728×90) - desktop/tablet
- Mobile banner (320×50) - mobile only (above and below video)
- Sidebar (300×250) - tablet/desktop

Always reference `process.env.NEXT_PUBLIC_ADSTERRA_KEY` rather than hardcoding
the ad key directly. Update this value in `.env.local` when changing ad networks.
<!-- END:adsterra-agent-rules -->
