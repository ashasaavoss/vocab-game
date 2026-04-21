import type { EstimatorResult } from "../lib/stats";

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

type Props = {
  estimate: EstimatorResult;
};

export function Results({ estimate }: Props) {
  const precise = estimate.totals.precise;
  const basis =
    estimate.sampled === 0
      ? "Prior estimate — answer some words to tighten the interval."
      : `Based on ${estimate.sampled} ${estimate.sampled === 1 ? "answer" : "answers"} drawn from ${estimate.universeSize.toLocaleString()} words.`;

  return (
    <div className="panel">
      <div
        className="muted"
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginBottom: 4,
        }}
      >
        Vocabulary Verdict
      </div>
      <div className="estimate" style={{ fontSize: 30 }}>
        {fmt(precise.mean)} words
      </div>
      <div className="ci" style={{ marginTop: 2 }}>
        80% CI: {fmt(precise.ci80[0])} – {fmt(precise.ci80[1])}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        {basis}
      </div>
    </div>
  );
}
