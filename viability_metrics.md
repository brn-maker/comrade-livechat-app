# Viability Analytics Strategy - Comrade MVP

To verify if Comrade is a viable venture, you must move beyond "number of signups" and track deep engagement signals.

## 📊 Key Viability Metrics

### 1. Retention (The "Sticky" Score)
- **Goal**: Do users find enough value to return?
- **Metric**: **D1, D7, and D30 Retention**.
- **Action**: Use PostHog or Supabase to track returning user IDs over time.

### 2. Match Quality (The "Connection" Score)
- **Goal**: Are people actually talking?
- **Metric**: **Average Match Duration**.
- **Success Signal**: Matches lasting > 60 seconds. Instant skips ( < 5s) suggest poor matching or content issues.
- **Logging**: Already implemented in `public.matches`.

### 3. Friction & Churn (The "Frustration" Score)
- **Goal**: Is matching too slow?
- **Metric**: **Time-to-Match**.
- **Action**: Track how long a user spends in the `searching` state before a match is found. If this exceeds 30-40s, churn will spike.

### 4. Feature Validation (AR Filters)
- **Goal**: Do filters add value?
- **Metric**: **Filter Adoption Rate** vs. **Match Duration**.
- **Hypothesis**: Users with active filters should have longer matches due to reduced "camera shyness."

---

## 🛠️ Recommended Analytics Stack

| Tool | Purpose | Why for MVP? |
| :--- | :--- | :--- |
| **PostHog** | Product Analytics | Open-source, includes heatmaps and session recordings (see where users get stuck). |
| **Sentry** | Error Tracking | Essential for debugging WebRTC failures across different browsers/networks. |
| **Supabase (SQL)**| Business Intel | You can write a single SQL query to see "Avg matches per user" or "Top gender combinations." |

## 💡 Next Steps for Implementation

1. **Client-Side Events**: Add a simple event tracker to `ChatRoom.tsx` when:
   - `Next Match` is clicked.
   - A filter is changed.
   - `getUserMedia` fails (to track camera permission denials).
2. **Dashboard**: Create a "Viability Dashboard" in Supabase or PostHog to monitor these metrics daily during your first 1,000 users.
