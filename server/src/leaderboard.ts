/**
 * Leaderboard store backed by Upstash Redis (REST).
 *
 * Schema: a single hash at key `leaderboard`, with one field per username
 * (lowercased) whose value is the JSON-encoded LeaderboardEntry.
 *
 * If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set (e.g. local
 * dev without an Upstash account), we fall back to an in-memory Map. That
 * fallback is explicitly non-durable — fine for localhost, useless in prod.
 */

import { Redis } from "@upstash/redis";

const HASH_KEY = "leaderboard";

export type Level = "precise" | "rough" | "gist";

export type LevelTotal = {
  mean: number;
  ci80: [number, number];
};

export type LeaderboardEntry = {
  username: string;
  nAnswered: number;
  difficultyMode: "easy" | "medium" | "hard";
  theta: Record<Level, number>;
  totalVocab: Record<Level, LevelTotal>;
  updatedAt: string; // ISO timestamp
  corpusSize: number; // the universe the estimate was computed against
};

const redis: Redis | null = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn(
      "[leaderboard] UPSTASH_REDIS_REST_URL/TOKEN not set — using in-memory fallback (non-durable).",
    );
    return null;
  }
  return new Redis({ url, token });
})();

const memory: Map<string, LeaderboardEntry> = new Map();

function parseEntry(raw: unknown): LeaderboardEntry | null {
  if (raw == null) return null;
  // Upstash auto-decodes JSON values for us, but tolerate strings too.
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as LeaderboardEntry;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as LeaderboardEntry;
  return null;
}

export async function upsertEntry(entry: LeaderboardEntry): Promise<void> {
  const key = entry.username.toLowerCase();
  if (redis) {
    await redis.hset(HASH_KEY, { [key]: JSON.stringify(entry) });
  } else {
    memory.set(key, entry);
  }
}

export async function listEntries(): Promise<LeaderboardEntry[]> {
  let entries: LeaderboardEntry[];
  if (redis) {
    const all = (await redis.hgetall(HASH_KEY)) as Record<string, unknown> | null;
    entries = [];
    if (all) {
      for (const v of Object.values(all)) {
        const parsed = parseEntry(v);
        if (parsed) entries.push(parsed);
      }
    }
  } else {
    entries = Array.from(memory.values());
  }
  return entries.sort(
    (a, b) => b.totalVocab.rough.mean - a.totalVocab.rough.mean,
  );
}

export async function deleteEntry(username: string): Promise<void> {
  const key = username.toLowerCase();
  if (redis) {
    await redis.hdel(HASH_KEY, key);
  } else {
    memory.delete(key);
  }
}
