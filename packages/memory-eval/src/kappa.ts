/**
 * Cohen's kappa for human-judge calibration
 *
 * κ = (p_o - p_e) / (1 - p_e)
 * where p_o = observed agreement, p_e = expected agreement by chance
 */

export interface KappaResult {
  /** Cohen's kappa value */
  kappa: number
  /** Observed agreement */
  observedAgreement: number
  /** Expected agreement */
  expectedAgreement: number
  /** Is valid (κ >= threshold)? */
  valid: boolean
  /** Confusion matrix [[TN, FP], [FN, TP]] */
  confusionMatrix: number[][]
}

/**
 * Compute Cohen's kappa for binary classification
 *
 * @param humanLabels - Human annotations (0 = no drift, 1 = drift)
 * @param judgeLabels - Judge predictions (0 = no drift, 1 = drift)
 * @param validityThreshold - Minimum κ for validity (default 0.4)
 */
export function cohensKappa(
  humanLabels: number[],
  judgeLabels: number[],
  validityThreshold = 0.4
): KappaResult {
  if (humanLabels.length !== judgeLabels.length) {
    throw new Error('Label arrays must have equal length')
  }

  const n = humanLabels.length

  // Confusion matrix
  const cm = [[0, 0], [0, 0]]  // [[TN, FP], [FN, TP]]
  for (let i = 0; i < n; i++) {
    const h = humanLabels[i]
    const j = judgeLabels[i]
    cm[h][j]++
  }

  // Observed agreement
  const po = (cm[0][0] + cm[1][1]) / n

  // Expected agreement
  const humanNeg = cm[0][0] + cm[0][1]
  const humanPos = cm[1][0] + cm[1][1]
  const judgeNeg = cm[0][0] + cm[1][0]
  const judgePos = cm[0][1] + cm[1][1]
  const pe = (humanNeg * judgeNeg + humanPos * judgePos) / (n * n)

  // Cohen's kappa
  const kappa = pe < 1 ? (po - pe) / (1 - pe) : 0

  return {
    kappa,
    observedAgreement: po,
    expectedAgreement: pe,
    valid: kappa >= validityThreshold,
    confusionMatrix: cm
  }
}
