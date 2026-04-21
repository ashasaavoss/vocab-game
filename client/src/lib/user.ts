import type { Grade } from "./stats";

export type DifficultyMode = "easy" | "medium" | "hard";

/** Logit offset applied to the adaptive-selection target. */
export const DIFFICULTY_OFFSET: Record<DifficultyMode, number> = {
  easy: -1.0, // aim for words the current posterior says ~73% will be known
  medium: 0.0, // aim for 50% — max Fisher information
  hard: 1.0, // aim for words the current posterior says ~27% will be known
};

export type Response = {
  word: string;
  beta: number;
  referenceDefinition: string;
  userDefinition: string;
  grade: Grade;
  rationale: string;
  answeredAt: number;
};

export type UserState = {
  username: string;
  createdAt: number;
  lastActiveAt: number;
  responses: Response[];
  difficultyMode: DifficultyMode;
};

const USER_PREFIX = "vocabulary-sampler:user:v4:";
const USERS_KEY = "vocabulary-sampler:users";

const USERNAME_RE = /^[a-z][a-z0-9_]{1,19}$/i;

export function isValidUsername(name: string): boolean {
  return USERNAME_RE.test(name);
}

export function listUsers(): string[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((v): v is string => typeof v === "string").sort();
  } catch {
    return [];
  }
}

function persistUserList(users: string[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function storageKey(username: string): string {
  return `${USER_PREFIX}${username.toLowerCase()}`;
}

export function loadUser(username: string): UserState {
  const key = storageKey(username);
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<UserState>;
      if (parsed && Array.isArray(parsed.responses)) {
        return {
          username,
          createdAt: parsed.createdAt ?? Date.now(),
          lastActiveAt: parsed.lastActiveAt ?? Date.now(),
          responses: parsed.responses,
          difficultyMode: parsed.difficultyMode ?? "medium",
        };
      }
    } catch {
      // fall through
    }
  }
  const fresh: UserState = {
    username,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    responses: [],
    difficultyMode: "medium",
  };
  saveUser(fresh);
  return fresh;
}

export function saveUser(state: UserState): void {
  const updated: UserState = { ...state, lastActiveAt: Date.now() };
  localStorage.setItem(storageKey(state.username), JSON.stringify(updated));
  const list = listUsers();
  if (!list.includes(state.username)) {
    list.push(state.username);
    persistUserList(list);
  }
}

export function resetUser(
  username: string,
  difficultyMode: DifficultyMode = "medium",
): UserState {
  const fresh: UserState = {
    username,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    responses: [],
    difficultyMode,
  };
  saveUser(fresh);
  return fresh;
}

export function deleteUser(username: string): void {
  localStorage.removeItem(storageKey(username));
  const list = listUsers().filter((u) => u !== username);
  persistUserList(list);
}

const EXPORT_FORMAT = "vocabulary-sampler-session";
const EXPORT_VERSION = 4;

type ExportEnvelope = {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: number;
  user: UserState;
};

export function serializeUser(state: UserState): string {
  const envelope: ExportEnvelope = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    user: state,
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseImport(json: string): UserState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("File is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("File is not a vocabulary-sampler export.");
  }
  const env = parsed as Partial<ExportEnvelope>;
  if (env.format !== EXPORT_FORMAT) {
    throw new Error("File is not a vocabulary-sampler export.");
  }
  if (env.version !== EXPORT_VERSION) {
    throw new Error(
      `Unsupported export version ${env.version} (expected ${EXPORT_VERSION}).`,
    );
  }
  const u = env.user as Partial<UserState> | undefined;
  if (!u || typeof u.username !== "string" || !isValidUsername(u.username)) {
    throw new Error("Export is missing a valid username.");
  }
  if (!Array.isArray(u.responses)) {
    throw new Error("Export is missing a responses array.");
  }
  const mode: DifficultyMode =
    u.difficultyMode === "easy" ||
    u.difficultyMode === "medium" ||
    u.difficultyMode === "hard"
      ? u.difficultyMode
      : "medium";
  return {
    username: u.username,
    createdAt: typeof u.createdAt === "number" ? u.createdAt : Date.now(),
    lastActiveAt: typeof u.lastActiveAt === "number" ? u.lastActiveAt : Date.now(),
    responses: u.responses,
    difficultyMode: mode,
  };
}

export function readUserFromUrl(): string | null {
  const url = new URL(window.location.href);
  const u = url.searchParams.get("u");
  if (u && isValidUsername(u)) return u;
  return null;
}

export function setUrlUser(username: string | null): void {
  const url = new URL(window.location.href);
  if (username) url.searchParams.set("u", username);
  else url.searchParams.delete("u");
  // Also strip the old session token if present.
  url.searchParams.delete("s");
  window.history.replaceState(null, "", url.toString());
}
