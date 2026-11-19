import type { InferOutput } from 'valibot'

import type { PluginRuntime } from './types'

import { array, check, description, minLength, object, pipe, string } from 'valibot'

import { isExactSemanticVersion } from '../../kit/exact-semantic-version'
import { pluginRuntimeSchema } from './types'

/**
 * Validates one declared capability inside a kit descriptor.
 *
 * Use when:
 * - Parsing or validating host-owned kit descriptors
 *
 * Expects:
 * - `key` is stable and `actions` lists the allowed capability actions
 *
 * Returns:
 * - A Valibot schema for one kit capability descriptor
 */
export const kitCapabilitySchema = object({
  key: pipe(
    string(),
    check(key => Boolean(key.trim()) && key.trim() === key, 'Use a non-empty capability key without outer whitespace.'),
    description('Stable capability key exposed by this kit.'),
  ),
  actions: pipe(
    array(pipe(
      string(),
      check(action => Boolean(action.trim()) && action.trim() === action, 'Use a non-empty capability action without outer whitespace.'),
      description('Capability action supported by this kit capability entry.'),
    )),
    check(actions => new Set(actions).size === actions.length, 'Declare each capability action once.'),
    description('Allowed actions for this capability key.'),
  ),
})

/**
 * Validates one host-owned kit descriptor.
 *
 * Use when:
 * - Parsing or validating kit registry snapshots
 *
 * Expects:
 * - `capabilities` and `runtimes` describe where and how the kit can be used
 *
 * Returns:
 * - A Valibot schema for one kit descriptor
 */
export const kitDescriptorSchema = object({
  kitId: pipe(
    string(),
    check(kitId => Boolean(kitId) && kitId.trim() === kitId, 'Use a non-empty Kit id without outer whitespace.'),
    description('Stable identifier for the host-registered kit.'),
  ),
  version: pipe(
    string(),
    check(isExactSemanticVersion, 'Use an exact semantic version.'),
    description('Semantic version of the kit contract.'),
  ),
  capabilities: pipe(
    array(kitCapabilitySchema),
    check(
      capabilities => new Set(capabilities.map(capability => capability.key)).size === capabilities.length,
      'Declare each capability key once.',
    ),
    description('Capabilities exposed by this kit descriptor.'),
  ),
  runtimes: pipe(
    array(pipe(
      pluginRuntimeSchema,
      description('Runtime supported by this kit descriptor.'),
    )),
    minLength(1),
    check(runtimes => new Set(runtimes).size === runtimes.length, 'Declare each runtime once.'),
    description('Runtimes where this kit can be used.'),
  ),
})

/**
 * Describes one capability declared by a host kit.
 *
 * Use when:
 * - Reading kit metadata from the registry or plugin APIs
 *
 * Expects:
 * - Values have already been validated by {@link kitCapabilitySchema}
 *
 * Returns:
 * - The inferred kit capability descriptor type
 */
export type KitCapabilityDescriptor = InferOutput<typeof kitCapabilitySchema>

/** Immutable capability metadata accepted by the Host registry. */
export interface KitCapabilityDescriptorSnapshot {
  /** Stable capability key. */
  readonly key: string
  /** Accepted actions for this capability. */
  readonly actions: readonly string[]
}
/**
 * Describes one host-registered kit contract.
 *
 * Use when:
 * - Reading kit metadata from the registry or plugin APIs
 *
 * Expects:
 * - Values have already been validated by {@link kitDescriptorSchema}
 *
 * Returns:
 * - The inferred kit descriptor type
 */
export type KitDescriptor = InferOutput<typeof kitDescriptorSchema>

/** Immutable point-in-time descriptor accepted by the Host registry. */
export interface KitDescriptorSnapshot {
  /** Stable Kit identifier. */
  readonly kitId: string
  /** Exact Kit version. */
  readonly version: string
  /** Runtimes that can use this Kit. */
  readonly runtimes: readonly PluginRuntime[]
  /** Capabilities exposed by this Kit. */
  readonly capabilities: readonly KitCapabilityDescriptorSnapshot[]
}
