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
# Adsterra Ad Configuration

Adsterra ads are configured in `ChatRoom.tsx` with hardcoded keys and domain:
- Domain: `poetrywishing.com`
- 728×90 (desktop top): key `424a78ff12fb52d9b3b607082a82e0da`
- 300×250 (sidebar): key `9f48332788889fe28990df7941804ce7`
- 320×50 (mobile): key `c953e02f5f0e664f79775c8f80677edb`

The `AdSlot` component dynamically injects Adsterra's invoke.js script.
When no adKey is provided or the ad fails to load within 5 seconds, a placeholder is shown.
<!-- END:adsterra-agent-rules -->
