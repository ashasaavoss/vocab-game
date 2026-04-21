/**
 * 1PL (Rasch) Item Response Theory with grid-based posterior inference.
 *
 *   P(known_i | θ, β_i) = σ(θ - β_i)
 *
 * θ: person ability. β_i: word difficulty (standardized log-rank of frequency).
 * Prior: θ ~ N(0, 1.5).
 *
 * Posterior is computed on a discrete θ grid — fast, no sampler needed, and
 * integrating to get CIs / mean is exact on the grid.
 *
 * For the final vocabulary-size estimate we draw θ samples from the grid
 * posterior (inverse-CDF) and, for each sample, compute
 *    N_known(θ) = Σ_{j in universe} σ(θ - β_j)
 * This gives a Monte Carlo posterior over the total words the user knows.
 */

const DEFAULT_PRIOR_MEAN = 0;
const PRIOR_SD = 1.5;
const GRID_MIN = -5;
const GRID_MAX = 5;
const GRID_STEP = 0.05;

export type IrtResponse = { beta: number; known: boolean };

export type ThetaPosterior = {
  grid: number[]; // theta values, evenly spaced by GRID_STEP
  density: number[]; // posterior density at each grid point, normalized (∫ density dθ = 1)
  cdf: number[]; // cumulative density at each grid point
  mean: number;
  ci80: [number, number];
  ci95: [number, number];
};

export type TotalPosterior = {
  samples: number[];
  mean: number;
  ci80: [number, number];
  ci95: [number, number];
};

// --- numerics ---

/** softplus(x) = log(1 + exp(x)), with overflow/underflow guards. */
function softplus(x: number): number {
  if (x > 30) return x;
  if (x < -30) return Math.exp(x);
  return Math.log1p(Math.exp(x));
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

function makeGrid(): number[] {
  const n = Math.round((GRID_MAX - GRID_MIN) / GRID_STEP) + 1;
  const g = new Array<number>(n);
  for (let i = 0; i < n; i++) g[i] = GRID_MIN + i * GRID_STEP;
  return g;
}

// --- log-prior ---

function logPrior(theta: number, priorMean: number): number {
  const z = (theta - priorMean) / PRIOR_SD;
  // -0.5 * z^2  plus  -log(sigma * sqrt(2*pi))  but constants drop out at normalization
  return -0.5 * z * z;
}

// --- log-likelihood per response ---

/**
 * log P(known_i | θ, β_i) = -softplus(β_i - θ)
 * log P(!known_i | θ, β_i) = -softplus(θ - β_i)
 */
function logLikOne(theta: number, r: IrtResponse): number {
  return r.known ? -softplus(r.beta - theta) : -softplus(theta - r.beta);
}

// --- posterior ---

export function computePosterior(
  responses: IrtResponse[],
  priorMean: number = DEFAULT_PRIOR_MEAN,
): ThetaPosterior {
  const grid = makeGrid();
  const logPost = new Array<number>(grid.length);
  for (let i = 0; i < grid.length; i++) {
    const t = grid[i]!;
    let lp = logPrior(t, priorMean);
    for (const r of responses) lp += logLikOne(t, r);
    logPost[i] = lp;
  }
  // Normalize in log-space for stability, then exponentiate.
  let maxLp = -Infinity;
  for (const lp of logPost) if (lp > maxLp) maxLp = lp;
  const density = new Array<number>(grid.length);
  let norm = 0;
  for (let i = 0; i < grid.length; i++) {
    density[i] = Math.exp(logPost[i]! - maxLp);
    norm += density[i]!;
  }
  // Trapezoid factor would be multiplication by dθ, but we normalize by the sum
  // and then use midpoint-rule consistency throughout — density values are
  // expressed such that Σ density_i * dθ = 1.
  const scale = 1 / (norm * GRID_STEP);
  for (let i = 0; i < density.length; i++) density[i]! *= scale;

  // CDF
  const cdf = new Array<number>(grid.length);
  let acc = 0;
  for (let i = 0; i < grid.length; i++) {
    acc += density[i]! * GRID_STEP;
    cdf[i] = acc;
  }
  // Fix numerical drift so cdf ends at exactly 1
  const last = cdf[cdf.length - 1] ?? 1;
  if (last > 0) for (let i = 0; i < cdf.length; i++) cdf[i]! /= last;

  // Mean
  let mean = 0;
  for (let i = 0; i < grid.length; i++) mean += grid[i]! * density[i]! * GRID_STEP;

  const quantile = (p: number): number => {
    // Find smallest i with cdf[i] >= p, interpolate linearly.
    for (let i = 0; i < cdf.length; i++) {
      if (cdf[i]! >= p) {
        if (i === 0) return grid[0]!;
        const prevCdf = cdf[i - 1]!;
        const curCdf = cdf[i]!;
        const frac = (p - prevCdf) / (curCdf - prevCdf || 1);
        return grid[i - 1]! + frac * GRID_STEP;
      }
    }
    return grid[grid.length - 1]!;
  };

  return {
    grid,
    density,
    cdf,
    mean,
    ci80: [quantile(0.1), quantile(0.9)],
    ci95: [quantile(0.025), quantile(0.975)],
  };
}

// --- adaptive selection ---

/**
 * Pick a β value close to the current posterior mean — with randomization among
 * the K closest unseen items so different users don't see identical item orderings.
 */
export function pickBetaNearestTo(
  target: number,
  unseenBetas: { beta: number; index: number }[],
  topK = 20,
): { beta: number; index: number } | null {
  if (unseenBetas.length === 0) return null;
  const sorted = [...unseenBetas].sort(
    (a, b) => Math.abs(a.beta - target) - Math.abs(b.beta - target),
  );
  const pool = sorted.slice(0, Math.min(topK, sorted.length));
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

// --- sampling from grid posterior ---

function sampleTheta(posterior: ThetaPosterior): number {
  const u = Math.random();
  const { cdf, grid } = posterior;
  for (let i = 0; i < cdf.length; i++) {
    if (cdf[i]! >= u) {
      if (i === 0) return grid[0]!;
      const prev = cdf[i - 1]!;
      const cur = cdf[i]!;
      const frac = (u - prev) / (cur - prev || 1);
      return grid[i - 1]! + frac * GRID_STEP;
    }
  }
  return grid[grid.length - 1]!;
}

// --- total vocabulary posterior ---

export function estimateTotalKnown(
  posterior: ThetaPosterior,
  universeBetas: Float64Array,
  numSamples = 600,
): TotalPosterior {
  const samples = new Array<number>(numSamples);
  const n = universeBetas.length;
  for (let s = 0; s < numSamples; s++) {
    const theta = sampleTheta(posterior);
    let sum = 0;
    for (let j = 0; j < n; j++) sum += sigmoid(theta - universeBetas[j]!);
    samples[s] = sum;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / numSamples;
  const q = (p: number) =>
    sorted[Math.max(0, Math.min(numSamples - 1, Math.floor(p * numSamples)))] ?? 0;
  return {
    samples,
    mean,
    ci80: [q(0.1), q(0.9)],
    ci95: [q(0.025), q(0.975)],
  };
}
