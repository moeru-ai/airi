import type { FormulaSpeechCase } from '../formula-speech/cases'

import { readFileSync } from 'node:fs'

/** One row of `sample.json`, written by ./fetch. */
interface MathBridgeRow {
  /** `uniform`, or a topic such as `expectation`. A `-long` suffix marks a formula longer than 80 characters. */
  stratum: string
  offset: number
  contextBefore: string
  equation: string
  contextAfter: string
  spokenEnglish: string
}

const sample = JSON.parse(readFileSync(new URL('./sample.json', import.meta.url), 'utf8')) as { rows: MathBridgeRow[] }

/**
 * Repairs what the MathBridge tokenizer split. It writes `\{` as `\ {` and `\%` as `\ %`. In TeX `\ ` is a space and
 * `%` starts a comment, so `68.3\ %` loses its percent sign and `\ { 1, 2 \ }` loses its set braces.
 */
function untokenize(tex: string): string {
  return tex.replace(/\\ ([{}%])/g, '\\$1')
}

/**
 * Formulas of MathBridge (MIT license), a sample of formulas from arXiv papers of 2023 and open textbooks.
 *
 * The cases add realistic notation to the textbook set. Each input is the formula alone, because the listener writes
 * down one formula and the grader compares formulas. The sentence around it stays in `note`. The dataset is English,
 * so a run selects it with `EVAL_DATASET=math-bridge EVAL_LANGUAGES=en`.
 */
export const mathBridgeCases: readonly FormulaSpeechCase[] = sample.rows.map((row) => {
  const tex = untokenize(row.equation.replace(/^\s*\$+|\$+\s*$/g, '').trim())
  return {
    id: `mb-${row.offset}`,
    stratum: `math-bridge-${row.stratum}`,
    source: `MathBridge#${row.offset}`,
    mode: 'symbolic',
    reference: tex,
    input: `$${tex}$`,
    note: `${row.contextBefore} [formula] ${row.contextAfter}`.slice(0, 200),
  }
})
