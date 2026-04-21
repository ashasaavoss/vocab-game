/**
 * Offline simulation: given a true θ, simulate adaptive responses against the
 * live corpus and print how 80%/95% CI widths shrink with n.
 *
 * Run: `npx tsx scripts/sim-convergence.ts`
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = join(__dirname, "..", "client", "public", "corpus.json");

type CorpusEntry = { word: string; beta: number };
type Corpus = { size: number; words: CorpusEntry[] };

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8")) as Corpus;
const universeBetas = new Float64Array(corpus.size);
for (let i = 0; i < corpus.size; i++) universeBetas[i] = corpus.words[i]!.beta;

// --- irt primitives (inlined from client/src/lib/irt.ts) ---

const PRIOR_MEAN = 0;
const PRIOR_SD = 1.5;
const GRID_MIN = -5;
const GRID_MAX = 5;
const GRID_STEP = 0.05;

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
function randn(): number {
  const u1 = Math.random() || 1e-12;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function makeGrid(): number[] {
  const n = Math.round((GRID_MAX - GRID_MIN) / GRID_STEP) + 1;
  const g: number[] = new Array(n);
  for (let i = 0; i < n; i++) g[i] = GRID_MIN + i * GRID_STEP;
  return g;
}

type Posterior = {
  grid: number[];
  density: number[];
  cdf: number[];
  mean: number;
  sd: number;
  ci80: [number, number];
};

function computePosterior(
  responses: { beta: number; known: boolean }[],
  priorMean: number = PRIOR_MEAN,
): Posterior {
  const grid = makeGrid();
  const logPost = new Array<number>(grid.length);
  for (let i = 0; i < grid.length; i++) {
    const t = grid[i]!;
    const z = (t - priorMean) / PRIOR_SD;
    let lp = -0.5 * z * z;
    for (const r of responses) {
      lp += r.known ? -softplus(r.beta - t) : -softplus(t - r.beta);
    }
    logPost[i] = lp;
  }
  let maxLp = -Infinity;
  for (const lp of logPost) if (lp > maxLp) maxLp = lp;
  const density = new Array<number>(grid.length);
  let norm = 0;
  for (let i = 0; i < grid.length; i++) {
    density[i] = Math.exp(logPost[i]! - maxLp);
    norm += density[i]!;
  }
  const scale = 1 / (norm * GRID_STEP);
  for (let i = 0; i < density.length; i++) density[i]! *= scale;
  const cdf = new Array<number>(grid.length);
  let acc = 0;
  for (let i = 0; i < grid.length; i++) {
    acc += density[i]! * GRID_STEP;
    cdf[i] = acc;
  }
  const last = cdf[cdf.length - 1] ?? 1;
  if (last > 0) for (let i = 0; i < cdf.length; i++) cdf[i]! /= last;
  let mean = 0;
  let meanSq = 0;
  for (let i = 0; i < grid.length; i++) {
    mean += grid[i]! * density[i]! * GRID_STEP;
    meanSq += grid[i]! * grid[i]! * density[i]! * GRID_STEP;
  }
  const sd = Math.sqrt(Math.max(0, meanSq - mean * mean));
  const quantile = (p: number): number => {
    for (let i = 0; i < cdf.length; i++) {
      if (cdf[i]! >= p) {
        if (i === 0) return grid[0]!;
        const prev = cdf[i - 1]!;
        const cur = cdf[i]!;
        const frac = (p - prev) / (cur - prev || 1);
        return grid[i - 1]! + frac * GRID_STEP;
      }
    }
    return grid[grid.length - 1]!;
  };
  return { grid, density, cdf, mean, sd, ci80: [quantile(0.1), quantile(0.9)] };
}

function sampleTheta(posterior: Posterior): number {
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

function estimateTotalCI(posterior: Posterior, samples = 1000): {
  mean: number;
  ci80w: number;
} {
  const ts = new Array<number>(samples);
  for (let s = 0; s < samples; s++) {
    const theta = sampleTheta(posterior);
    let sum = 0;
    for (let j = 0; j < universeBetas.length; j++) {
      sum += sigmoid(theta - universeBetas[j]!);
    }
    ts[s] = sum;
  }
  ts.sort((a, b) => a - b);
  const lo = ts[Math.floor(0.1 * samples)]!;
  const hi = ts[Math.floor(0.9 * samples)]!;
  const mean = ts.reduce((a, b) => a + b, 0) / samples;
  return { mean, ci80w: hi - lo };
}

// --- simulate adaptive run ---

function simulate(trueTheta: number, mode: "easy" | "medium" | "hard", nMax: number) {
  const offsetMap = { easy: -1.0, medium: 0.0, hard: 1.0 };
  const offset = offsetMap[mode];
  const responses: { beta: number; known: boolean }[] = [];
  const seenIdx = new Set<number>();
  console.log(
    `\n=== true θ = ${trueTheta}, mode = ${mode} ===\n` +
      `n  θ̂   θ_sd  total̂   total_80%_width`,
  );
  for (let n = 0; n <= nMax; n++) {
    const post = computePosterior(responses);
    if ([0, 1, 3, 5, 10, 20, 40, 80, 150].includes(n)) {
      const { mean, ci80w } = estimateTotalCI(post);
      console.log(
        `${n.toString().padStart(3)}  ${post.mean.toFixed(2).padStart(5)}  ${post.sd
          .toFixed(2)
          .padStart(4)}   ${Math.round(mean).toString().padStart(6)}   ${Math.round(ci80w)
          .toString()
          .padStart(5)}`,
      );
    }
    if (n === nMax) break;
    const target = post.mean + offset + randn() * 0.35;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < universeBetas.length; i++) {
      if (seenIdx.has(i)) continue;
      const d = Math.abs(universeBetas[i]! - target);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    seenIdx.add(bestIdx);
    const beta = universeBetas[bestIdx]!;
    const p = sigmoid(trueTheta - beta);
    const known = Math.random() < p;
    responses.push({ beta, known });
  }
}

simulate(0.0, "medium", 150);
simulate(2.0, "medium", 150);
simulate(0.0, "easy", 150);
simulate(0.0, "hard", 150);
