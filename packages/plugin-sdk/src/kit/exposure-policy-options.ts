import type { ExposePolicy } from './exposure-policy'

import { safeParse } from 'valibot'

import { exposePolicyListSchema, exposePolicySchema } from './exposure-policy'

/** Stable default shared by accepted values that omit an allowed policy list. */
const defaultExposePolicies: readonly ExposePolicy[] = Object.freeze(['local-only'])
/** Stable result for invalid allowed policies. Reuse avoids a new object for each failed normalization. */
const invalidAllowedExposePolicies = Object.freeze({ success: false as const, reason: 'allowed-policies' as const })
/** Stable result for an invalid or disallowed default policy. */
const invalidDefaultExposePolicy = Object.freeze({ success: false as const, reason: 'default-policy' as const })

/** Caller-owned exposure policy values captured before normalization. */
interface CapturedExposurePolicyOptions {
  readonly policiesAreArray: boolean
  readonly allowedExposePolicies?: readonly unknown[]
  readonly defaultExposePolicy: unknown
}

/** Immutable policy values accepted for one Kit registration. */
interface NormalizedExposurePolicyOptions {
  /** Policies declared by the caller. The value is absent when the caller uses the default. */
  readonly declaredExposePolicies?: readonly ExposePolicy[]
  /** Declared policies or the stable `local-only` default. */
  readonly effectiveExposePolicies: readonly ExposePolicy[]
  /** Selected default policy, when the caller declares one. */
  readonly defaultExposePolicy?: ExposePolicy
}

type ExposurePolicyOptionsResult
  = | { readonly success: true, readonly output: NormalizedExposurePolicyOptions }
    | { readonly success: false, readonly reason: 'allowed-policies' | 'default-policy' }

/**
 * Normalizes the exposure policy values that a Contract or Host factory declares.
 *
 * @example
 * normalizeExposurePolicyOptions({ policiesAreArray: true, defaultExposePolicy: undefined })
 * // => { success: true, output: { declaredExposePolicies: undefined, effectiveExposePolicies: ['local-only'] } }
 */
export function normalizeExposurePolicyOptions(input: CapturedExposurePolicyOptions): ExposurePolicyOptionsResult {
  if (!input.policiesAreArray) {
    return invalidAllowedExposePolicies
  }

  const policiesResult = input.allowedExposePolicies === undefined
    ? undefined
    : safeParse(exposePolicyListSchema, input.allowedExposePolicies)
  if (policiesResult && !policiesResult.success) {
    return invalidAllowedExposePolicies
  }

  const declaredExposePolicies = policiesResult?.success
    ? Object.freeze([...policiesResult.output])
    : undefined
  const effectiveExposePolicies = declaredExposePolicies ?? defaultExposePolicies
  const defaultPolicyResult = input.defaultExposePolicy === undefined
    ? undefined
    : safeParse(exposePolicySchema, input.defaultExposePolicy)
  if (defaultPolicyResult && (!defaultPolicyResult.success || !effectiveExposePolicies.includes(defaultPolicyResult.output))) {
    return invalidDefaultExposePolicy
  }

  return Object.freeze({
    success: true,
    output: Object.freeze({
      declaredExposePolicies,
      effectiveExposePolicies,
      defaultExposePolicy: defaultPolicyResult?.output,
    }),
  })
}
