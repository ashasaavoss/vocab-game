import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import express from "express";
import cors from "cors";
import { gradeDefinition, type Grade } from "./grader.js";
import { checkRateLimit } from "./rateLimit.js";
import { appendGradingLog } from "./log.js";
import {
  upsertEntry,
  listEntries,
  deleteEntry,
  type LeaderboardEntry,
  type Level,
} from "./leaderboard.js";

// Load .env from the project root regardless of where the server is launched from.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "..", "..", ".env") });

const PORT = Number(process.env.PORT ?? 8787);
const HAS_KEY = !!process.env.GEMINI_API_KEY;
const IS_PROD = process.env.NODE_ENV === "production";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "http://localhost:5173";

if (!HAS_KEY) {
  console.warn(
    "[server] GEMINI_API_KEY not set — /api/grade will return a fake-grader response for UI testing.",
  );
}

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasKey: HAS_KEY });
});

type GradeBody = {
  word?: unknown;
  referenceDefinition?: unknown;
  userDefinition?: unknown;
  sessionId?: unknown;
};

app.post("/api/grade", async (req, res) => {
  const body = req.body as GradeBody;

  const word = typeof body.word === "string" ? body.word.trim() : "";
  const reference =
    typeof body.referenceDefinition === "string"
      ? body.referenceDefinition.trim()
      : "";
  const userDef =
    typeof body.userDefinition === "string"
      ? body.userDefinition.trim()
      : "";
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";

  if (!word || word.length > 64 || !/^[a-zA-Z-]+$/.test(word)) {
    return res.status(400).json({ error: "invalid word" });
  }
  if (!reference || reference.length > 500) {
    return res.status(400).json({ error: "invalid reference" });
  }
  if (userDef.length > 1000) {
    return res.status(400).json({ error: "definition too long" });
  }
  if (!sessionId) {
    return res.status(400).json({ error: "missing sessionId" });
  }

  const rate = checkRateLimit(sessionId);
  if (!rate.ok) {
    return res.status(429).json({
      error: "rate_limited",
      reason: rate.reason,
      retryAfterMs: rate.retryAfterMs,
    });
  }

  // Empty / skip is a valid signal — record as "unknown" without calling Gemini.
  if (!userDef) {
    const out = { grade: "unknown" as Grade, rationale: "no answer" };
    void appendGradingLog({
      sessionId,
      word,
      referenceDefinition: reference,
      userDefinition: userDef,
      grade: out.grade,
      rationale: out.rationale,
      source: "empty",
    });
    return res.json(out);
  }

  if (!HAS_KEY) {
    // Fake-grader: hash-based pseudo-random grade so UI is testable without a key.
    const grades: Grade[] = ["precise", "rough", "gist", "wrong"];
    const h = Array.from(userDef).reduce((a, c) => a + c.charCodeAt(0), 0);
    const picked = grades[h % grades.length] ?? "gist";
    const out = { grade: picked, rationale: "[fake grader — no API key]" };
    void appendGradingLog({
      sessionId,
      word,
      referenceDefinition: reference,
      userDefinition: userDef,
      grade: out.grade,
      rationale: out.rationale,
      source: "fake",
    });
    return res.json(out);
  }

  try {
    const result = await gradeDefinition({
      word,
      reference,
      userDefinition: userDef,
    });
    void appendGradingLog({
      sessionId,
      word,
      referenceDefinition: reference,
      userDefinition: userDef,
      grade: result.grade,
      rationale: result.rationale,
      source: "gemini",
    });
    res.json(result);
  } catch (err) {
    console.error("[server] grading error:", err);
    res.status(502).json({ error: "grading_failed" });
  }
});

// --- leaderboard endpoints ---

const LEVELS: Level[] = ["precise", "rough", "gist"];
const MODES = ["easy", "medium", "hard"] as const;

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

app.post("/api/stats", (req, res) => {
  const body = req.body as Record<string, unknown>;

  const username =
    typeof body.username === "string" ? body.username.trim() : "";
  if (!username || !/^[a-z][a-z0-9_]{1,19}$/i.test(username)) {
    return res.status(400).json({ error: "invalid username" });
  }

  const nAnswered = isNum(body.nAnswered) ? body.nAnswered : 0;
  if (nAnswered < 0 || nAnswered > 1_000_000) {
    return res.status(400).json({ error: "invalid nAnswered" });
  }

  const difficultyMode = MODES.includes(body.difficultyMode as (typeof MODES)[number])
    ? (body.difficultyMode as (typeof MODES)[number])
    : "medium";

  const corpusSize = isNum(body.corpusSize) ? body.corpusSize : 0;

  const thetaIn = body.theta as Record<string, unknown> | undefined;
  const totalIn = body.totalVocab as Record<string, unknown> | undefined;
  if (!thetaIn || !totalIn) {
    return res.status(400).json({ error: "missing theta or totalVocab" });
  }
  const theta = {} as Record<Level, number>;
  const totalVocab = {} as Record<Level, { mean: number; ci80: [number, number] }>;
  for (const level of LEVELS) {
    const t = thetaIn[level];
    if (!isNum(t)) return res.status(400).json({ error: `invalid theta.${level}` });
    theta[level] = t;

    const tv = totalIn[level] as Record<string, unknown> | undefined;
    const mean = tv && isNum(tv.mean) ? tv.mean : NaN;
    const ci80 = tv && Array.isArray(tv.ci80) ? tv.ci80 : null;
    if (!isNum(mean) || !ci80 || ci80.length !== 2 || !isNum(ci80[0]) || !isNum(ci80[1])) {
      return res.status(400).json({ error: `invalid totalVocab.${level}` });
    }
    totalVocab[level] = { mean, ci80: [ci80[0], ci80[1]] };
  }

  const entry: LeaderboardEntry = {
    username,
    nAnswered,
    difficultyMode,
    theta,
    totalVocab,
    corpusSize,
    updatedAt: new Date().toISOString(),
  };
  upsertEntry(entry);
  res.json({ ok: true });
});

app.get("/api/leaderboard", (_req, res) => {
  res.json({ entries: listEntries() });
});

app.delete("/api/stats/:username", (req, res) => {
  const username = req.params.username;
  if (!username || !/^[a-z][a-z0-9_]{1,19}$/i.test(username)) {
    return res.status(400).json({ error: "invalid username" });
  }
  deleteEntry(username);
  res.json({ ok: true });
});

// In production, serve the built client as static files from the same origin.
// In dev, Vite serves the client on :5173 and proxies /api to this server.
if (IS_PROD) {
  const clientDist = resolve(__dirname, "..", "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(resolve(clientDist, "index.html"));
  });
  console.log(`[server] production mode: serving client from ${clientDist}`);
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
