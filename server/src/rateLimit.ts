// Per-session in-memory rate limiter. Token bucket: 30 grades / minute, burst 10.
const BUCKET_CAPACITY = 10;
const REFILL_PER_MS = 30 / (60 * 1000);

type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

// Global cap across all sessions. Rolling 24h window, resets in-memory on process restart.
const GLOBAL_DAILY_LIMIT = Number(process.env.GLOBAL_DAILY_LIMIT ?? 500);
const DAY_MS = 24 * 60 * 60 * 1000;
const globalWindow = { count: 0, startedAt: Date.now() };

export function checkRateLimit(
  sessionId: string,
): { ok: true } | { ok: false; retryAfterMs: number; reason: "session" | "global" } {
  const now = Date.now();

  // Global daily cap — checked first so a single session can't exhaust it quietly.
  if (now - globalWindow.startedAt >= DAY_MS) {
    globalWindow.count = 0;
    globalWindow.startedAt = now;
  }
  if (globalWindow.count >= GLOBAL_DAILY_LIMIT) {
    const retryAfterMs = DAY_MS - (now - globalWindow.startedAt);
    return { ok: false, retryAfterMs, reason: "global" };
  }

  const b = buckets.get(sessionId) ?? {
    tokens: BUCKET_CAPACITY,
    updatedAt: now,
  };
  const elapsed = now - b.updatedAt;
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + elapsed * REFILL_PER_MS);
  b.updatedAt = now;
  if (b.tokens < 1) {
    const retryAfterMs = Math.ceil((1 - b.tokens) / REFILL_PER_MS);
    buckets.set(sessionId, b);
    return { ok: false, retryAfterMs, reason: "session" };
  }
  b.tokens -= 1;
  buckets.set(sessionId, b);
  globalWindow.count += 1;
  return { ok: true };
}
