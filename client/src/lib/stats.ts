/**
 * Vocabulary estimator built on 1PL IRT.
 *
 * For each level L ∈ {precise, rough, gist} we binarize grades and fit a
 * separate θ posterior on the shared θ grid. Total words known at level L is
 * then the Monte Carlo posterior over Σ σ(θ - β_j) over the full corpus.
 */

import {
  computePosterior,
  estimateTotalKnown,
  type IrtResponse,
  type ThetaPosterior,
  type TotalPosterior,
} from "./irt";

export type Grade = "precise" | "rough" | "gist" | "wrong" | "unknown";
export type Level = "precise" | "rough" | "gist";

const LEVEL_INCLUDES: Record<Level, Set<Grade>> = {
  precise: new Set(["precise"]),
  rough: new Set(["precise", "rough"]),
  gist: new Set(["precise", "rough", "gist"]),
};

// Per-level prior means encode the common-sense ordering
//   P(precise) < P(rough+) < P(gist+)
// in the absence of data. ±0.6 logits ≈ halving/doubling odds, producing visibly
// different initial predictions. Data dominates the prior after a handful of answers.
export const LEVEL_PRIOR_MEAN: Record<Level, number> = {
  precise: -0.6,
  rough: 0.0,
  gist: 0.6,
};

export function isKnown(level: Level, grade: Grade): boolean {
  return LEVEL_INCLUDES[level].has(grade);
}

export type GradedResponse = { beta: number; grade: Grade };

export type EstimatorResult = {
  sampled: number;
  universeSize: number;
  posteriors: Record<Level, ThetaPosterior>;
  totals: Record<Level, TotalPosterior>;
};

export function estimate(
  responses: GradedResponse[],
  universeBetas: Float64Array,
): EstimatorResult {
  const posteriors = {} as Record<Level, ThetaPosterior>;
  const totals = {} as Record<Level, TotalPosterior>;

  for (const level of ["precise", "rough", "gist"] as Level[]) {
    const irtResponses: IrtResponse[] = responses.map((r) => ({
      beta: r.beta,
      known: isKnown(level, r.grade),
    }));
    const post = computePosterior(irtResponses, LEVEL_PRIOR_MEAN[level]);
    posteriors[level] = post;
    totals[level] = estimateTotalKnown(post, universeBetas);
  }

  return {
    sampled: responses.length,
    universeSize: universeBetas.length,
    posteriors,
    totals,
  };
}
