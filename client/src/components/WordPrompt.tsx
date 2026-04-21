import { useEffect, useRef, useState } from "react";
import type { CorpusEntry } from "../lib/corpus";
import type { Grade } from "../lib/stats";

type Props = {
  entry: CorpusEntry;
  onSubmit: (userDefinition: string) => Promise<{ grade: Grade; rationale: string }>;
  onNext: () => void;
  submitting: boolean;
};

const POS_LABEL: Record<string, string> = {
  n: "noun",
  v: "verb",
  a: "adjective",
  r: "adverb",
};

export function WordPrompt({ entry, onSubmit, onNext, submitting }: Props) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<{ grade: Grade; rationale: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText("");
    setFeedback(null);
    setError(null);
    textareaRef.current?.focus();
  }, [entry.word]);

  async function handleSubmit(skip: boolean) {
    if (submitting) return;
    setError(null);
    try {
      const result = await onSubmit(skip ? "" : text);
      setFeedback(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSubmit(false);
    }
  }

  return (
    <div className="panel">
      <h2>Next question for the witness</h2>
      <p className="word">{entry.word}</p>
      <div className="pos">{POS_LABEL[entry.pos] ?? entry.pos}</div>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Define this word in your own words. Ctrl/Cmd+Enter to submit."
        disabled={!!feedback || submitting}
        maxLength={1000}
      />

      {!feedback && (
        <div className="row space" style={{ marginTop: 12 }}>
          <button
            className="secondary"
            onClick={() => handleSubmit(true)}
            disabled={submitting}
          >
            I don't know
          </button>
          <button onClick={() => handleSubmit(false)} disabled={submitting || !text.trim()}>
            {submitting ? "Deliberating…" : "Testify"}
          </button>
        </div>
      )}

      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {feedback && (
        <div className="feedback">
          <div
            className="row space"
            style={{ alignItems: "baseline", marginBottom: 6 }}
          >
            <span
              className="muted"
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}
            >
              Judgment
            </span>
            <span className={`grade ${feedback.grade}`}>
              {feedback.grade.toUpperCase()}
            </span>
          </div>
          {feedback.rationale && (
            <div style={{ marginTop: 8 }}>
              <div
                className="muted"
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 2,
                }}
              >
                The court's reasoning
              </div>
              <div className="rationale">{feedback.rationale}</div>
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <div
              className="muted"
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 2,
              }}
            >
              Reference definition
            </div>
            <div className="ref" style={{ marginTop: 0 }}>{entry.definition}</div>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button onClick={onNext} autoFocus>Next Question</button>
          </div>
        </div>
      )}
    </div>
  );
}
