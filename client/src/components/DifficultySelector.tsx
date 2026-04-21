import type { DifficultyMode } from "../lib/user";

type Props = {
  mode: DifficultyMode;
  onChange: (mode: DifficultyMode) => void;
};

const MODES: { key: DifficultyMode; label: string; sub: string }[] = [
  { key: "easy", label: "Easy", sub: "~73% you'll know" },
  { key: "medium", label: "Medium", sub: "~50% — most informative" },
  { key: "hard", label: "Hard", sub: "~27% you'll know" },
];

export function DifficultySelector({ mode, onChange }: Props) {
  return (
    <div>
      <div
        className="muted"
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        Difficulty
      </div>
      <div className="row" style={{ gap: 4 }}>
        {MODES.map((m) => (
          <button
            key={m.key}
            className={mode === m.key ? "" : "secondary"}
            onClick={() => onChange(m.key)}
            style={{ padding: "6px 10px", fontSize: 13, flex: 1 }}
            title={m.sub}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
