import type { Grade, Level } from "./stats";
import type { DifficultyMode } from "./user";

export type GradeResponse = { grade: Grade; rationale: string };

export async function gradeDefinition(params: {
  word: string;
  referenceDefinition: string;
  userDefinition: string;
  sessionId: string;
}): Promise<GradeResponse> {
  const res = await fetch("/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`grade failed (${res.status}): ${body}`);
  }
  return (await res.json()) as GradeResponse;
}

export async function health(): Promise<{ ok: boolean; hasKey: boolean }> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health failed: ${res.status}`);
  return await res.json();
}

export type StatsUpload = {
  username: string;
  nAnswered: number;
  difficultyMode: DifficultyMode;
  corpusSize: number;
  theta: Record<Level, number>;
  totalVocab: Record<Level, { mean: number; ci80: [number, number] }>;
};

export async function uploadStats(stats: StatsUpload): Promise<void> {
  await fetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stats),
  });
}

export type LeaderboardEntry = StatsUpload & { updatedAt: string };

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch("/api/leaderboard");
  if (!res.ok) throw new Error(`leaderboard fetch failed: ${res.status}`);
  const body = (await res.json()) as { entries: LeaderboardEntry[] };
  return body.entries ?? [];
}

export async function deleteStats(username: string): Promise<void> {
  await fetch(`/api/stats/${encodeURIComponent(username)}`, { method: "DELETE" });
}
