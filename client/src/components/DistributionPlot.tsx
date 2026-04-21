type Props = {
  samples: number[];
  ci80: [number, number];
  mean: number;
};

// Small SVG histogram of posterior samples, with 80% CI shaded.
export function DistributionPlot({ samples, ci80, mean }: Props) {
  if (samples.length === 0) return null;

  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = Math.max(1e-6, max - min);

  const numBins = 30;
  const bins = new Array<number>(numBins).fill(0);
  for (const s of samples) {
    const idx = Math.min(numBins - 1, Math.floor(((s - min) / range) * numBins));
    bins[idx] = (bins[idx] ?? 0) + 1;
  }
  const maxCount = Math.max(...bins);

  const w = 300;
  const h = 60;
  const barW = w / numBins;

  const xAt = (v: number) => ((v - min) / range) * w;

  return (
    <svg className="dist-plot" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {/* 80% CI band */}
      <rect
        x={xAt(ci80[0])}
        y={0}
        width={Math.max(1, xAt(ci80[1]) - xAt(ci80[0]))}
        height={h}
        fill="rgba(138, 180, 255, 0.15)"
      />
      {bins.map((c, i) => {
        const barH = (c / maxCount) * (h - 4);
        return (
          <rect
            key={i}
            x={i * barW}
            y={h - barH}
            width={Math.max(0.5, barW - 0.5)}
            height={barH}
            fill="rgba(160, 224, 200, 0.8)"
          />
        );
      })}
      {/* mean marker */}
      <line
        x1={xAt(mean)}
        x2={xAt(mean)}
        y1={0}
        y2={h}
        stroke="rgba(255,255,255,0.8)"
        strokeWidth="1"
      />
    </svg>
  );
}
