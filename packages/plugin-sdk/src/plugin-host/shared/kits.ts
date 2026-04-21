import type { InferOutput } from 'valibot'

import { array, description, object, pipe, string } from 'valibot'

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
    description('Stable capability key exposed by this kit.'),
  ),
  actions: pipe(
    array(pipe(
      string(),
      description('Capability action supported by this kit capability entry.'),
    )),
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
    description('Stable identifier for the host-registered kit.'),
  ),
  version: pipe(
    string(),
    description('Semantic version of the kit contract.'),
  ),
  capabilities: pipe(
    array(kitCapabilitySchema),
    description('Capabilities exposed by this kit descriptor.'),
  ),
  runtimes: pipe(
    array(pipe(
      pluginRuntimeSchema,
      description('Runtime supported by this kit descriptor.'),
    )),
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
