/**
 * File-backed leaderboard store. One JSON file keyed by username. The whole
 * thing is loaded into memory on startup and rewritten atomically on every
 * upsert. Low-volume, friends-only — no need for a real database.
 */

import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const STORE_PATH = resolve(DATA_DIR, "leaderboard.json");
const TMP_PATH = resolve(DATA_DIR, "leaderboard.tmp.json");

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

let store: Map<string, LeaderboardEntry> = new Map();

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadFromDisk(): void {
  try {
    if (!existsSync(STORE_PATH)) {
      store = new Map();
      return;
    }
    const raw = readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, LeaderboardEntry>;
    store = new Map(Object.entries(parsed));
  } catch (err) {
    console.error("[leaderboard] failed to load store, starting empty:", err);
    store = new Map();
  }
}

function persist(): void {
  try {
    ensureDir();
    const obj: Record<string, LeaderboardEntry> = {};
    for (const [k, v] of store) obj[k] = v;
    writeFileSync(TMP_PATH, JSON.stringify(obj, null, 2), "utf8");
    renameSync(TMP_PATH, STORE_PATH); // atomic on POSIX and Windows (same volume)
  } catch (err) {
    console.error("[leaderboard] failed to persist:", err);
  }
}

loadFromDisk();

export function upsertEntry(entry: LeaderboardEntry): void {
  store.set(entry.username.toLowerCase(), entry);
  persist();
}

export function listEntries(): LeaderboardEntry[] {
  return Array.from(store.values()).sort((a, b) => {
    // Primary: rough+ total vocab mean, descending.
    return b.totalVocab.rough.mean - a.totalVocab.rough.mean;
  });
}

export function deleteEntry(username: string): void {
  if (store.delete(username.toLowerCase())) persist();
}
