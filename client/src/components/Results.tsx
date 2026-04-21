import type { EstimatorResult, Level } from "../lib/stats";
import { DistributionPlot } from "./DistributionPlot";

const LEVEL_COPY: Record<Level, { title: string; sub: string }> = {
  precise: {
    title: "Precise definitions",
    sub: "You can accurately explain the meaning.",
  },
  rough: {
    title: "At least roughly known",
    sub: "You grasp the meaning, even if imprecisely.",
  },
  gist: {
    title: "At least the gist",
    sub: "You have some sense of what the word means.",
  },
};

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return Math.round(n).toLocaleString();
  return n.toFixed(0);
}
function fmtTheta(t: number): string {
  return (t >= 0 ? "+" : "") + t.toFixed(2);
}

type Props = {
  estimate: EstimatorResult;
};

export function Results({ estimate }: Props) {
  const levels: Level[] = ["precise", "rough", "gist"];

  const preface =
    estimate.sampled === 0
      ? `Prior estimate (before any answers), drawn from the population prior θ ~ N(0, 1.5) over a corpus of ${estimate.universeSize.toLocaleString()} words. Intervals will tighten with each response.`
      : `Based on ${estimate.sampled} adaptively-selected ${
          estimate.sampled === 1 ? "answer" : "answers"
        } drawn from ${estimate.universeSize.toLocaleString()} words. θ is your estimated ability; higher means harder words are still within reach.`;

  return (
    <div className="panel">
      <div style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          {preface}
        </div>
      </div>

      {levels.map((level) => {
        const theta = estimate.posteriors[level];
        const total = estimate.totals[level];
        return (
          <div key={level} className="results-row">
            <div>
              <div className="level-label">{LEVEL_COPY[level].title}</div>
              <div className="level-sub">{LEVEL_COPY[level].sub}</div>
              <div className="ci" style={{ marginTop: 6 }}>
                θ = {fmtTheta(theta.mean)}{" "}
                <span className="muted">
                  (80% CI {fmtTheta(theta.ci80[0])}…{fmtTheta(theta.ci80[1])})
                </span>
              </div>
            </div>
            <div>
              <div className="estimate">~{fmt(total.mean)}</div>
              <div className="ci">
                80% CI: {fmt(total.ci80[0])}–{fmt(total.ci80[1])} · 95% CI:{" "}
                {fmt(total.ci95[0])}–{fmt(total.ci95[1])}
              </div>
              <DistributionPlot
                samples={total.samples}
                ci80={total.ci80}
                mean={total.mean}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
