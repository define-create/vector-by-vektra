import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

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

export const matchEntryLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "60 s"),
  ephemeralCache: new Map(),
  prefix: "rl:match-entry",
});
