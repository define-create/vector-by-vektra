import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Export redis instance for raw counter operations (anomaly detection, notif dedup)
export { redis };

// ephemeralCache short-circuits the Redis call when the same Edge instance
// already knows a key is under the limit — reduces latency and Redis usage.

export const authMutationLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60 s"),
  ephemeralCache: new Map(),
  prefix: "rl:auth-mutation",
});

export const signInLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  ephemeralCache: new Map(),
  prefix: "rl:sign-in",
});

// Non-admin users: 20 matches per hour hard cap
export const matchEntryLimiterUser = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "60 m"),
  ephemeralCache: new Map(),
  prefix: "rl:match-entry-user",
});

// Admin users: effectively unrestricted (500/hr)
export const matchEntryLimiterAdmin = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, "60 m"),
  ephemeralCache: new Map(),
  prefix: "rl:match-entry-admin",
});

// Feedback: 3 per 10 minutes per user (anti-spam)
export const feedbackLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "10 m"),
  ephemeralCache: new Map(),
  prefix: "rl:feedback",
});
