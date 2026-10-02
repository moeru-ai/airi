import type { Live2DControlPolicy } from '../types/avatar-model'

/** Identifies one expression or motion in a Live2D model. */
export type Live2DControlTarget
  = | { kind: 'expression', id: string }
    | { kind: 'motion', id: string }

/** Returns an empty policy that enables every model control. */
export function createLive2DControlPolicy(): Live2DControlPolicy {
  return {
    disabledExpressions: [],
    disabledMotions: [],
  }
}

/** Returns whether a Character policy enables one Live2D control. */
export function isLive2DControlEnabled(
  policy: Live2DControlPolicy,
  target: Live2DControlTarget,
): boolean {
  const disabledIds = target.kind === 'expression'
    ? policy.disabledExpressions
    : policy.disabledMotions

  return !disabledIds.includes(target.id)
}

/**
 * Returns a policy with one Live2D control enabled or disabled.
 *
 * This function does not change the input policy.
 */
export function updateLive2DControlPolicy(
  policy: Live2DControlPolicy,
  target: Live2DControlTarget,
  enabled: boolean,
): Live2DControlPolicy {
  const disabledIds = target.kind === 'expression'
    ? policy.disabledExpressions
    : policy.disabledMotions
  const nextDisabledIds = enabled
    ? disabledIds.filter(id => id !== target.id)
    : [...new Set([...disabledIds, target.id])]

  return {
    disabledExpressions: target.kind === 'expression'
      ? nextDisabledIds
      : [...policy.disabledExpressions],
    disabledMotions: target.kind === 'motion'
      ? nextDisabledIds
      : [...policy.disabledMotions],
  }
}
