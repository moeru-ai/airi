import type { MathJson } from '@proj-airi/mathjson'

import { ComputeEngine } from '@cortex-js/compute-engine'
import { MathSpeech } from '@proj-airi/speech-transformer-math'
import { describe, expect, it } from 'vitest'

import { formulaSpeechCases } from '../../../cases/formula-speech'

// The built-in packs. The chemistry cases are skipped below, so the reader has no extension.
const reader = new MathSpeech()

/**
 * The standard MathJSON heads that both trees use with one meaning. Other heads differ by design, see
 * docs/ai/adr/2026-10-20-speech-text-preprocessor.md: Compute Engine reads `AB` as a product and folds `50\%`, and the
 * speech tree keeps names, percents, units, and groups.
 */
const sharedHeads = new Set([
  'Equal',
  'NotEqual',
  'Less',
  'Greater',
  'LessEqual',
  'GreaterEqual',
  'Element',
  'NotElement',
  'SubsetEqual',
  'Subset',
  'Perpendicular',
  'Parallel',
  'Similar',
  'Congruent',
  'To',
  'Divide',
  'Power',
  'Sqrt',
  'Root',
  'Sum',
  'Product',
  'Integrate',
  'Limit',
  'D',
  'Interval',
  'Set',
  'Abs',
  'Union',
  'Intersection',
  'Add',
  'Subtract',
  'Negate',
  'PlusMinus',
  'Factorial',
  'Binomial',
])

/** Compute Engine names of shared meanings that differ from the speech tree. */
const computeEngineNames: Readonly<Record<string, string>> = { Tilde: 'Similar', TildeFullEqual: 'Congruent' }
/** The signature `f: X \to Y` holds its arrow in `Mapping`. */
const speechNames: Readonly<Record<string, string>> = { Mapping: 'To' }
/**
 * Heads that chain. Compute Engine writes `a + b + c` as one `Add`, and the speech tree nests `Add` in pairs, so a
 * nested head of the same name counts once.
 */
const chained = new Set(['Add', 'Multiply', 'Equal', 'Less', 'Greater', 'LessEqual', 'GreaterEqual'])
/** Compute Engine units are built from `Divide` and `Power`. The speech tree has `Unit`, so unit subtrees are skipped. */
const unitHeads = new Set(['__unit__', 'Unit'])

/** Counts the shared heads of a MathJSON tree, for example `{ Divide: 2, Power: 1 }`. */
function headCounts(expression: unknown, rename: Readonly<Record<string, string>> = {}): Map<string, number> {
  const counts = new Map<string, number>()
  const visit = (value: unknown, parent?: string) => {
    if (!Array.isArray(value))
      return
    const [head, ...args] = value as [unknown, ...unknown[]]
    if (typeof head !== 'string' || unitHeads.has(head))
      return
    const name = rename[head] ?? head
    if (sharedHeads.has(name) && (!chained.has(name) || parent !== name))
      counts.set(name, (counts.get(name) ?? 0) + 1)
    args.forEach(argument => visit(argument, name))
  }
  visit(expression)
  return counts
}

/** Lists the heads that one tree has more often than the other, for example `Power -1` when the speech tree lacks one. */
function difference(speech: Map<string, number>, reference: Map<string, number>): string {
  const heads = [...new Set([...speech.keys(), ...reference.keys()])].sort()
  return heads
    .map(head => [head, (speech.get(head) ?? 0) - (reference.get(head) ?? 0)] as const)
    .filter(([, delta]) => delta !== 0)
    .map(([head, delta]) => `${head} ${delta > 0 ? '+' : ''}${delta}`)
    .join(', ')
}

describe('speech MathJSON against Compute Engine', () => {
  // Runs on every formula case without a model call. The snapshot lists where the shared heads differ, so a change in
  // lowering shows up here before an eval run. A `+` is a head that only the speech tree has, and a `-` one that it lacks.
  it('finds the same standard structures as Compute Engine', () => {
    const engine = new ComputeEngine()
    const differences: Record<string, string> = {}
    for (const item of formulaSpeechCases) {
      // Currency cases are sentences, and Compute Engine has no chemistry.
      if (typeof item.input !== 'string' || item.input.includes('\\ce'))
        continue
      const tex = item.input.replace(/^\$|\$$/g, '')
      const speech: MathJson = reader.toMathJson(tex)
      const reference = engine.parse(tex, { form: 'raw' }).json
      const found = difference(headCounts(speech, speechNames), headCounts(reference, computeEngineNames))
      if (found)
        differences[item.id] = found
    }

    // Known differences that the speech tree keeps by design:
    // - root-quadratic: Compute Engine reads `-b \pm \sqrt{...}` as a `Measurement` with an uncertainty.
    // - unit-c: Compute Engine folds `3\times10^{8}` into one number, so it has no `Power`.
    expect(differences).toMatchInlineSnapshot(`
      {
        "root-quadratic": "PlusMinus +1",
        "unit-c": "Power +1",
      }
    `)
  })
})
