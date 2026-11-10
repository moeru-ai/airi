import type { Expression } from '@cortex-js/compute-engine'

import type { KeptCase } from './normalize'

import { ComputeEngine, isFunction } from '@cortex-js/compute-engine'

import { foldLetterCase, stripWrappers } from './normalize'

const engine = new ComputeEngine()

const relations = new Set(['Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual'])

/**
 * Operators that the engine evaluates to a value. `lim sin x / x` and `lim x / sin x` both evaluate to 1,
 * so these operators must match one by one before values are compared.
 */
const evaluatedOperators = new Set(['Limit', 'Sum', 'Product', 'Integrate', 'D', 'Derivative'])

/** Prepares LaTeX for the parser: no sizing commands, one spelling of each relation, and products written out. */
function prepare(source: string, keep: KeptCase): string {
  let text = stripWrappers(source)
  text = text.replace(/\\left|\\right|\\,|\\;|\\!|\\displaystyle|\\limits/g, '')
  text = text.replace(/\\dfrac|\\tfrac/g, String.raw`\frac`)
  text = text.replace(/\\le(?![a-z])|\\leqslant/g, String.raw`\leq`)
  text = text.replace(/\\ge(?![a-z])|\\geqslant/g, String.raw`\geq`)
  text = text.replaceAll('π', String.raw`\pi`).replaceAll('∞', String.raw`\infty`).replaceAll('−', '-')
  // `n(n+1)` is a product here. Only f, g, and h name functions in the cases.
  text = text.replace(/(?<![\\A-Z])([a-ei-z])\s*\(/gi, String.raw`$1 \cdot (`)
  return keep === 'all' ? text : foldLetterCase(text, keep)
}

/** Equal by structure, by value for constants, or as an identity in the free variables, for example `n(n+1)` and `n^2+n`. */
function same(left: Expression, right: Expression): boolean {
  return left.isSame(right) || left.isEqual(right) === true || left.isIdenticallyEqual(right) === true
}

function operandsOf(expression: Expression): readonly Expression[] {
  return isFunction(expression) ? expression.ops : []
}

function evaluatedParts(expression: Expression): Expression[] {
  const own = evaluatedOperators.has(expression.operator) ? [expression] : []
  return [...own, ...operandsOf(expression).flatMap(evaluatedParts)]
}

/** Each limit, sum, product, integral, and derivative must match its counterpart, argument by argument. */
function evaluatedPartsMatch(left: Expression, right: Expression): boolean {
  const byJson = (expression: Expression) => JSON.stringify(expression.json)
  const leftParts = evaluatedParts(left).sort((a, b) => byJson(a).localeCompare(byJson(b)))
  const rightParts = evaluatedParts(right).sort((a, b) => byJson(a).localeCompare(byJson(b)))
  if (leftParts.length !== rightParts.length)
    return false

  return leftParts.every((part, index) => {
    const counterpart = rightParts[index]!
    if (part.operator !== counterpart.operator)
      return false
    if (part.isSame(counterpart))
      return true
    const ops = operandsOf(part)
    const counterpartOps = operandsOf(counterpart)
    return ops.length === counterpartOps.length && ops.every((op, opIndex) => same(op, counterpartOps[opIndex]!))
  })
}

/**
 * Tells whether a hypothesis is symbolically equivalent to the reference.
 *
 * Relations must have the same operator and equivalent sides. An equation may also swap its sides.
 * Unparsable input is not equivalent; it never throws.
 */
export function symbolicallyEquivalent(reference: string, hypothesis: string, keep: KeptCase): boolean {
  try {
    const expected = engine.parse(prepare(reference, keep))
    const actual = engine.parse(prepare(hypothesis, keep))
    if (!expected.isValid || !actual.isValid)
      return false
    if (expected.isSame(actual))
      return true
    if (!evaluatedPartsMatch(expected, actual))
      return false

    if (relations.has(expected.operator) || relations.has(actual.operator)) {
      if (expected.operator !== actual.operator || !isFunction(expected) || !isFunction(actual))
        return false
      if (same(expected.op1, actual.op1) && same(expected.op2, actual.op2))
        return true
      return expected.operator === 'Equal' && same(expected.op1, actual.op2) && same(expected.op2, actual.op1)
    }
    return same(expected, actual)
  }
  catch {
    return false
  }
}
