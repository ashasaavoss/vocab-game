import { useEffect, useMemo, useRef, useState } from "react";
import { loadCorpus, corpusBetas, type Corpus, type CorpusEntry } from "./lib/corpus";
import {
  listUsers,
  loadUser,
  saveUser,
  resetUser,
  readUserFromUrl,
  setUrlUser,
  serializeUser,
  parseImport,
  DIFFICULTY_OFFSET,
  type UserState,
} from "./lib/user";
import { pickNextWord } from "./lib/sampler";
import { estimate, type Grade } from "./lib/stats";
import { gradeDefinition, health, uploadStats } from "./lib/api";
import { WordPrompt } from "./components/WordPrompt";
import { Progress } from "./components/Progress";
import { Results } from "./components/Results";
import { History } from "./components/History";
import { UserPicker } from "./components/UserPicker";
import { Leaderboard } from "./components/Leaderboard";

type View = "play" | "history" | "leaderboard";

export function App() {
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [user, setUser] = useState<UserState | null>(null);
  const [knownUsers, setKnownUsers] = useState<string[]>([]);
  const [currentWord, setCurrentWord] = useState<CorpusEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<View>("play");
  const [serverStatus, setServerStatus] = useState<{ ok: boolean; hasKey: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [switchingUser, setSwitchingUser] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Initial load: corpus + known users + maybe a user from URL.
  useEffect(() => {
    loadCorpus()
      .then(setCorpus)
      .catch((err) => setLoadError(err.message));
    setKnownUsers(listUsers());
    const urlUser = readUserFromUrl();
    if (urlUser) setUser(loadUser(urlUser));
    health()
      .then(setServerStatus)
      .catch(() => setServerStatus({ ok: false, hasKey: false }));
  }, []);

  function handlePickUser(username: string) {
    const u = loadUser(username);
    setUser(u);
    setKnownUsers(listUsers());
    setUrlUser(username);
    setCurrentWord(null);
    setView("play");
    setSwitchingUser(false);
  }

  function handleSwitchUser() {
    setSwitchingUser(true);
  }

  function handleReset() {
    if (!user) return;
    if (!confirm(`Clear all answers for ${user.username}?`)) return;
    const fresh = resetUser(user.username, user.difficultyMode);
    setUser(fresh);
    setCurrentWord(null);
    setView("play");
  }

  function handleExport() {
    if (!user) return;
    const json = serializeUser(user);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${user.username}-vocabulary.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    importInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImport(text);
      const existing = listUsers();
      if (existing.some((u) => u.toLowerCase() === imported.username.toLowerCase())) {
        if (!confirm(`"${imported.username}" already exists in this browser. Overwrite it with the imported data?`)) {
          return;
        }
      }
      saveUser(imported);
      setKnownUsers(listUsers());
      setUser(imported);
      setUrlUser(imported.username);
      setCurrentWord(null);
      setView("play");
      setSwitchingUser(false);
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const betas = useMemo(() => (corpus ? corpusBetas(corpus) : null), [corpus]);

  // Remap stored response β values against the current corpus so β scale stays
  // consistent when the corpus is regenerated (e.g. switching frequency source).
  // Falls back to the stored β if the word is no longer in the corpus.
  const syncedResponses = useMemo(() => {
    if (!user) return [];
    if (!corpus) return user.responses;
    const byWord = new Map(corpus.words.map((w) => [w.word, w.beta]));
    return user.responses.map((r) => {
      const current = byWord.get(r.word);
      return current !== undefined ? { ...r, beta: current } : r;
    });
  }, [user, corpus]);

  // Pick next word whenever needed (no test-length cap).
  useEffect(() => {
    if (!corpus || !user || currentWord) return;
    const next = pickNextWord(
      corpus,
      syncedResponses.map((r) => ({ word: r.word, beta: r.beta, grade: r.grade })),
      DIFFICULTY_OFFSET.medium,
    );
    setCurrentWord(next);
  }, [corpus, user, currentWord, syncedResponses]);

  const estimateResult = useMemo(() => {
    if (!user || !betas) return null;
    return estimate(
      syncedResponses.map((r) => ({ beta: r.beta, grade: r.grade })),
      betas,
    );
  }, [user, betas, syncedResponses]);

  // Upload stats whenever the estimate changes and there's meaningful data.
  useEffect(() => {
    if (!user || !estimateResult || !corpus) return;
    if (user.responses.length === 0) return; // don't clutter leaderboard with prior-only entries
    void uploadStats({
      username: user.username,
      nAnswered: user.responses.length,
      difficultyMode: "medium",
      corpusSize: corpus.size,
      theta: {
        precise: estimateResult.posteriors.precise.mean,
        rough: estimateResult.posteriors.rough.mean,
        gist: estimateResult.posteriors.gist.mean,
      },
      totalVocab: {
        precise: {
          mean: estimateResult.totals.precise.mean,
          ci80: estimateResult.totals.precise.ci80,
        },
        rough: {
          mean: estimateResult.totals.rough.mean,
          ci80: estimateResult.totals.rough.ci80,
        },
        gist: {
          mean: estimateResult.totals.gist.mean,
          ci80: estimateResult.totals.gist.ci80,
        },
      },
    });
  }, [user, estimateResult, corpus]);

  async function handleSubmit(userDefinition: string): Promise<{ grade: Grade; rationale: string }> {
    if (!currentWord || !user) throw new Error("not ready");
    setSubmitting(true);
    try {
      const result = await gradeDefinition({
        word: currentWord.word,
        referenceDefinition: currentWord.definition,
        userDefinition,
        sessionId: user.username,
      });
      const next: UserState = {
        ...user,
        responses: [
          ...user.responses,
          {
            word: currentWord.word,
            beta: currentWord.beta,
            referenceDefinition: currentWord.definition,
            userDefinition,
            grade: result.grade,
            rationale: result.rationale,
            answeredAt: Date.now(),
          },
        ],
      };
      saveUser(next);
      setUser(next);
      return result;
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    setCurrentWord(null);
  }

  const showPicker = !user || switchingUser;

  return (
    <div className="app">
      <header className="hero">
        <img
          src="/word-court.png"
          alt="A dignified courtroom labelled 'Word Court' — a judge at the bench, a witness on the left, a lawyer at a lectern on the right, a jury at the back."
        />
        <div className="text">
          <h1>Word Court</h1>
          <p className="subtitle">How many words do you know?</p>
          <p className="byline">by Asha</p>
        </div>
      </header>

      {user && (
        <nav className="topnav">
          <button
            className={`tab ${view === "play" ? "active" : ""}`}
            onClick={() => setView("play")}
          >
            Play
          </button>
          <button
            className={`tab ${view === "leaderboard" ? "active" : ""}`}
            onClick={() => setView("leaderboard")}
          >
            Docket
          </button>
          <button
            className={`tab ${view === "history" ? "active" : ""}`}
            onClick={() => setView("history")}
          >
            Case File
            {user.responses.length > 0 && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                ({user.responses.length})
              </span>
            )}
          </button>
        </nav>
      )}

      {loadError && <div className="error">Failed to load corpus: {loadError}</div>}

      {serverStatus && !serverStatus.hasKey && (
        <div className="notice">
          Server running without a Gemini API key — grading is a deterministic
          stub for UI testing. Add <code>GEMINI_API_KEY</code> to{" "}
          <code>.env</code> and restart the server for real grading.
        </div>
      )}

      {showPicker && (
        <UserPicker
          knownUsers={knownUsers}
          onSelect={handlePickUser}
          onImportClick={handleImportClick}
        />
      )}

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportFile}
        style={{ display: "none" }}
      />

      {!showPicker && user && corpus && (
        <>
          <div className="row space" style={{ alignItems: "baseline" }}>
            <div style={{ fontFamily: "var(--font-body-serif)", fontSize: 14 }}>
              Defendant:{" "}
              <span style={{ fontWeight: 600, color: "var(--accent)" }}>
                {user.username}
              </span>
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button
                className="ghost"
                onClick={handleSwitchUser}
                style={{ fontSize: 12 }}
              >
                switch user
              </button>
              <button
                className="ghost"
                onClick={handleExport}
                style={{ fontSize: 12 }}
                title="Download a JSON file of this user's answers and grades"
              >
                export
              </button>
              <button
                className="ghost"
                onClick={handleImportClick}
                style={{ fontSize: 12 }}
                title="Load a previously-exported session file"
              >
                import
              </button>
              <button
                className="ghost"
                onClick={handleReset}
                style={{ fontSize: 12 }}
              >
                reset my data
              </button>
            </div>
          </div>

          <Progress
            totalAnswered={user.responses.length}
            universeSize={corpus.size}
          />

          {view === "play" && currentWord && (
            <WordPrompt
              entry={currentWord}
              onSubmit={handleSubmit}
              onNext={handleNext}
              submitting={submitting}
            />
          )}

          {view === "play" && estimateResult && (
            <Results estimate={estimateResult} />
          )}

          {view === "history" && (
            <History responses={user.responses} />
          )}

          {view === "leaderboard" && (
            <Leaderboard currentUsername={user.username} />
          )}
        </>
      )}

      <footer>
        Vocabulary estimates based on 1PL IRT + adaptive item selection over a
        corpus of {corpus ? corpus.size.toLocaleString() : "…"} words.
      </footer>
    </div>
  );
}
