import { useState } from "react";
import type { Response } from "../lib/user";
import type { Grade } from "../lib/stats";

type Props = {
  responses: Response[];
};

type Filter = "all" | Grade;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "all" },
  { key: "precise", label: "precise" },
  { key: "rough", label: "rough" },
  { key: "gist", label: "gist" },
  { key: "wrong", label: "wrong" },
  { key: "unknown", label: "unknown" },
];

export function History({ responses }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  if (responses.length === 0) {
    return (
      <div className="panel">
        <div className="muted" style={{ fontSize: 14 }}>
          No answers yet. The full grading history will appear here.
        </div>
      </div>
    );
  }

  const sorted = [...responses].sort((a, b) => b.answeredAt - a.answeredAt);
  const filtered =
    filter === "all" ? sorted : sorted.filter((r) => r.grade === filter);

  return (
    <div className="panel">
      <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
        {FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? responses.length
              : responses.filter((r) => r.grade === f.key).length;
          return (
            <button
              key={f.key}
              className={filter === f.key ? "" : "secondary"}
              onClick={() => setFilter(f.key)}
              style={{ padding: "6px 10px", fontSize: 13 }}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="muted" style={{ fontSize: 14 }}>
          No {filter} answers yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((r, i) => (
            <HistoryItem
              key={`${r.word}-${r.answeredAt}-${i}`}
              response={r}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryItem({ response }: { response: Response }) {
  const when = new Date(response.answeredAt).toLocaleString();
  return (
    <div
      style={{
        border: "1px solid var(--border-soft)",
        borderRadius: 4,
        padding: 12,
        background: "var(--panel-2)",
      }}
    >
      <div className="row space" style={{ alignItems: "baseline" }}>
        <div>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{response.word}</span>
        </div>
        <span className={`grade ${response.grade}`} style={{ fontSize: 13 }}>
          {response.grade.toUpperCase()}
        </span>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
        {when}
      </div>

      <div style={{ marginTop: 10, fontSize: 14 }}>
        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Your answer
        </div>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {response.userDefinition || <span className="muted">(skipped)</span>}
        </div>
      </div>

      {response.rationale && (
        <div style={{ marginTop: 10, fontSize: 14 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Gemini's rationale
          </div>
          <div>{response.rationale}</div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 14 }}>
        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Reference
        </div>
        <div className="muted">{response.referenceDefinition}</div>
      </div>
    </div>
  );
}
