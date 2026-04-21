import { appendFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Grade } from "./grader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(__dirname, "..", "logs");
const LOG_PATH = resolve(LOG_DIR, "grading.jsonl");

let ensured = false;
async function ensureDir() {
  if (ensured) return;
  await mkdir(LOG_DIR, { recursive: true });
  ensured = true;
}

export type GradingLogEntry = {
  ts: string;
  sessionId: string;
  word: string;
  referenceDefinition: string;
  userDefinition: string;
  grade: Grade;
  rationale: string;
  source: "gemini" | "fake" | "empty";
};

export async function appendGradingLog(
  entry: Omit<GradingLogEntry, "ts">,
): Promise<void> {
  try {
    await ensureDir();
    const record: GradingLogEntry = { ts: new Date().toISOString(), ...entry };
    await appendFile(LOG_PATH, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    // Logging must never break grading.
    console.error("[log] failed to append grading log:", err);
  }
}

export { LOG_PATH };
