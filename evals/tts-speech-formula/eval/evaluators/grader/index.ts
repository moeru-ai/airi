import type { FormulaSpeechCase } from '../../cases/formula-speech/cases'
import type { KeptCase } from './normalize'

import { sameChemistry } from './chem'
import { sameCurrencySentence } from './currency'
import { canonicalize, caseSensitiveLetters } from './normalize'
import { symbolicallyEquivalent } from './symbolic'

/**
 * The grade of one written-down answer.
 *
 * `rule` names the check that decided it: `norm`, `symbolic`, `chem`, or `currency`.
 * `empty` means the listener wrote nothing, and `error` means the grader failed on malformed input.
 * `unclear` means the listener could not hear anything recoverable. The read-aloud task sets it, not {@link grade}.
 */
export interface Grade {
  score: 0 | 1
  rule: 'norm' | 'symbolic' | 'chem' | 'currency' | 'empty' | 'error' | 'unclear'
}

/**
 * Grades what a listener wrote down against the reference of a case. The result is deterministic, 1 or 0.
 * The listener model never grades. Malformed LaTeX scores 0 and never fails a run.
 */
export function grade(item: FormulaSpeechCase, hypothesis: string | undefined): Grade {
  try {
    return gradeUnsafe(item, hypothesis)
  }
  catch {
    return { score: 0, rule: 'error' }
  }
}

function gradeUnsafe(item: FormulaSpeechCase, hypothesis: string | undefined): Grade {
  if (!hypothesis?.trim())
    return { score: 0, rule: 'empty' }

  // Only currency cases have a list reference.
  if (typeof item.reference !== 'string')
    return { score: sameCurrencySentence(item.reference, hypothesis) ? 1 : 0, rule: 'currency' }

  const reference = item.reference
  if (item.mode === 'chem')
    return { score: sameChemistry(reference, hypothesis) ? 1 : 0, rule: 'chem' }

  const keep: KeptCase = item.letterCase === 'sensitive' ? 'all' : item.letterCase === 'fold' ? new Set() : caseSensitiveLetters(reference)
  if (canonicalize(reference, keep) === canonicalize(hypothesis, keep))
    return { score: 1, rule: 'norm' }
  if (item.mode === 'symbolic' && symbolicallyEquivalent(reference, hypothesis, keep))
    return { score: 1, rule: 'symbolic' }
  return { score: 0, rule: item.mode }
}

/**
 * Combines the grades of several listener votes. The item passes only with a strict majority of passing votes.
 *
 * @example
 * majorityScore([1, 0, 1])
 * // => 1
 */
export function majorityScore(scores: readonly (0 | 1)[]): 0 | 1 {
  return 2 * scores.reduce<number>((sum, score) => sum + score, 0) > scores.length ? 1 : 0
}
