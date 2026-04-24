import type { InferOutput } from 'valibot'

import type { HostDataRecord } from './types'

import { object, picklist, string } from 'valibot'

import { hostDataRecordSchema, nonNegativeIntegerSchema, pluginRuntimeValues } from './types'

/**
 * Lists the valid lifecycle states for one host-managed binding record.
 *
 * Use when:
 * - Validating binding state values
 * - Narrowing `BindingState` to the canonical lifecycle literals
 *
 * Expects:
 * - State transitions follow the host binding lifecycle rules
 *
 * Returns:
 * - The canonical ordered list of binding lifecycle values
 */
export const bindingStateValues = ['announced', 'active', 'degraded', 'withdrawn'] as const

/**
 * Validates the serializable shape of one binding record.
 *
 * Use when:
 * - Parsing or validating host-owned binding registry snapshots
 *
 * Expects:
 * - `config` is JSON-like host data and timestamps are non-negative integers
 *
 * Returns:
 * - A Valibot schema for one binding record
 */
export const bindingRecordSchema = object({
  moduleId: string(),
  ownerSessionId: string(),
  ownerPluginId: string(),
  kitId: string(),
  kitModuleType: string(),
  state: picklist(bindingStateValues),
  runtime: picklist(pluginRuntimeValues),
  revision: nonNegativeIntegerSchema,
  updatedAt: nonNegativeIntegerSchema,
  config: hostDataRecordSchema,
})

/**
 * Describes one valid binding lifecycle state.
 *
 * Use when:
 * - Typing host-owned binding records
 *
 * Expects:
 * - Values come from {@link bindingStateValues}
 *
 * Returns:
 * - The union of valid binding state literals
 */
export type BindingState = typeof bindingStateValues[number]
/**
 * Describes one host-managed binding record.
 *
 * Use when:
 * - Reading binding registry state from the host
 * - Returning binding snapshots through plugin APIs
 *
 * Expects:
 * - `moduleId` is unique within the registry
 * - `kitId` and `kitModuleType` identify the higher-level contract being bound
 *
 * Returns:
 * - A serializable binding snapshot including lifecycle metadata and config
 */
export interface BindingRecord<C extends HostDataRecord = HostDataRecord> {
  moduleId: string
  ownerSessionId: string
  ownerPluginId: string
  kitId: string
  kitModuleType: string
  state: BindingState
  runtime: (typeof pluginRuntimeValues)[number]
  revision: number
  updatedAt: number
  config: C
}
/**
 * Describes the validated output shape of {@link bindingRecordSchema}.
 *
 * Use when:
 * - You need the exact schema-derived output type instead of the generic interface
 *
 * Expects:
 * - Values have already passed through {@link bindingRecordSchema}
 *
 * Returns:
 * - The inferred Valibot output type for one binding record
 */
export type BindingRecordOutput = InferOutput<typeof bindingRecordSchema>
