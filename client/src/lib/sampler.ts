import type { Corpus, CorpusEntry } from "./corpus";
import { computePosterior, pickBetaNearestTo, type IrtResponse } from "./irt";
import { isKnown, type Grade } from "./stats";

// Gaussian jitter added to the β target each draw. Small enough that we stay
// near the informative neighborhood, large enough that two consecutive draws
// at the same posterior don't collide on identical top-K pools.
const JITTER_SD = 0.35;
// Top-K candidate pool for the final uniform pick — widened so that the jittered
// target still has meaningful randomization within the local neighborhood.
const POOL_SIZE = 30;

function randn(): number {
  const u1 = Math.random() || 1e-12;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Adaptive item selection via 1PL IRT with light target jitter.
 *
 *   1. Fit the "rough+" θ posterior to prior responses.
 *   2. Target β = posterior_mean + difficultyOffset + Normal(0, JITTER_SD²).
 *        difficultyOffset = 0    → P(know) ≈ 50% (max information)
 *        difficultyOffset > 0    → harder word (lower P(know))
 *        difficultyOffset < 0    → easier word (higher P(know))
 *   3. Pick uniformly at random from the POOL_SIZE closest-β unseen candidates.
 *
 * Without jitter the same posterior always prefers the same top-K, so re-rolls
 * and session restarts draw from a stable neighborhood. Jitter breaks that.
 */
export function pickNextWord(
  corpus: Corpus,
  priorResponses: { word: string; beta: number; grade: Grade }[],
  difficultyOffset = 0,
): CorpusEntry | null {
  const seen = new Set(priorResponses.map((r) => r.word));

  const irtResponses: IrtResponse[] = priorResponses.map((r) => ({
    beta: r.beta,
    known: isKnown("rough", r.grade),
  }));
  const posterior = computePosterior(irtResponses);
  const target = posterior.mean + difficultyOffset + randn() * JITTER_SD;

  const unseen: { beta: number; index: number }[] = [];
  for (let i = 0; i < corpus.words.length; i++) {
    const w = corpus.words[i]!;
    if (!seen.has(w.word)) unseen.push({ beta: w.beta, index: i });
  }
  const pick = pickBetaNearestTo(target, unseen, POOL_SIZE);
  if (!pick) return null;
  return corpus.words[pick.index] ?? null;
}
