import { useEffect, useState } from "react";
import { fetchLeaderboard, type LeaderboardEntry } from "../lib/api";

type Props = {
  currentUsername: string;
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

export function Leaderboard({ currentUsername }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reload() {
    setLoading(true);
    setError(null);
    fetchLeaderboard()
      .then((list) => {
        setEntries(list);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }

  useEffect(() => {
    reload();
  }, []);

  if (error) {
    return (
      <div className="panel">
        <div className="error">Failed to load leaderboard: {error}</div>
      </div>
    );
  }

  if (!entries && loading) {
    return (
      <div className="panel">
        <div className="muted" style={{ fontSize: 14 }}>
          Loading…
        </div>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="panel">
        <div className="muted" style={{ fontSize: 14 }}>
          No entries yet. Your stats will appear here after your first answer.
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div
        className="row space"
        style={{ alignItems: "baseline", marginBottom: 12 }}
      >
        <div className="muted" style={{ fontSize: 13 }}>
          Ranked by rough+ vocabulary estimate (posterior mean).
        </div>
        <button
          className="ghost"
          onClick={reload}
          style={{ fontSize: 12 }}
          disabled={loading}
        >
          {loading ? "refreshing…" : "refresh"}
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "left" }}>
              <Th>#</Th>
              <Th>User</Th>
              <Th style={{ textAlign: "right" }}>Rough+ vocab</Th>
              <Th style={{ textAlign: "right" }}>Precise</Th>
              <Th style={{ textAlign: "right" }}>Gist+</Th>
              <Th style={{ textAlign: "right" }}>θ (rough+)</Th>
              <Th style={{ textAlign: "right" }}>n</Th>
              <Th style={{ textAlign: "right" }}>Mode</Th>
              <Th style={{ textAlign: "right" }}>Active</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const isMe = e.username.toLowerCase() === currentUsername.toLowerCase();
              const rough = e.totalVocab.rough;
              return (
                <tr
                  key={e.username}
                  style={{
                    borderTop: "1px solid var(--border)",
                    background: isMe ? "rgba(138, 180, 255, 0.08)" : undefined,
                  }}
                >
                  <Td>{i + 1}</Td>
                  <Td>
                    <span
                      style={{
                        fontWeight: isMe ? 700 : 400,
                        color: isMe ? "var(--accent)" : undefined,
                      }}
                    >
                      {e.username}
                    </span>
                  </Td>
                  <Td style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 600 }}>{fmt(rough.mean)}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {fmt(rough.ci80[0])}–{fmt(rough.ci80[1])}
                    </div>
                  </Td>
                  <Td style={{ textAlign: "right" }}>{fmt(e.totalVocab.precise.mean)}</Td>
                  <Td style={{ textAlign: "right" }}>{fmt(e.totalVocab.gist.mean)}</Td>
                  <Td style={{ textAlign: "right" }}>
                    {(e.theta.rough >= 0 ? "+" : "") + e.theta.rough.toFixed(2)}
                  </Td>
                  <Td style={{ textAlign: "right" }}>{e.nAnswered}</Td>
                  <Td style={{ textAlign: "right" }} muted>
                    {e.difficultyMode}
                  </Td>
                  <Td style={{ textAlign: "right" }} muted>
                    {relativeTime(e.updatedAt)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      style={{
        padding: "6px 8px",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        fontWeight: 500,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
  muted,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  muted?: boolean;
}) {
  return (
    <td
      style={{
        padding: "8px",
        color: muted ? "var(--muted)" : undefined,
        ...style,
      }}
    >
      {children}
    </td>
  );
}
