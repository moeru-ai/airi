import type { ContextInit } from '@proj-airi/plugin-sdk'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'
import type { JsonSchema, Schema as StandardSchemaV1 } from 'xsschema'

import { hostDataRecordSchema } from '@proj-airi/plugin-sdk/plugin-host'
import { parse } from 'valibot'
import { toJsonSchema } from 'xsschema'

/**
 * Describes the host services available while checking or executing a plugin tool.
 *
 * Use when:
 * - Tool logic needs to orchestrate gamelet surfaces
 *
 * Expects:
 * - All methods are provided by the host runtime, not the plugin
 *
 * Returns:
 * - A runtime capability surface for tool execution
 */
export interface ToolExecutionContext {
  gamelets: {
    open: (id: string, params?: Record<string, unknown>) => Promise<void>
    configure: (id: string, patch: Record<string, unknown>) => Promise<void>
    close: (id: string) => Promise<void>
    isOpen: (id: string) => boolean
  }

  // TODO:
  // Add character/runtime orchestration APIs after the gamelet/tool path is stable.
}

/**
 * Describes renderer-side discovery hints for a plugin tool.
 *
 * Use when:
 * - Tool pickers or activation matchers need keywords and regexp patterns
 *
 * Expects:
 * - `patterns` are JavaScript `RegExp` instances and will be serialized by source
 *
 * Returns:
 * - Optional metadata separate from xsai execution schema
 */
export interface PluginToolActivationDefinition {
  keywords?: string[]
  patterns?: RegExp[]
}

/**
 * Describes one high-level plugin tool declaration.
 *
 * Use when:
 * - A plugin wants one declaration to drive host registry and xsai schema generation
 *
 * Expects:
 * - `inputSchema` is either an xsschema-compatible schema or a prebuilt JSON Schema object
 *
 * Returns:
 * - A friendly authoring record consumed by {@link defineToolset}
 */
export interface PluginToolDefinition<TInputSchema = unknown> {
  id: string
  title: string
  description: string
  activation?: PluginToolActivationDefinition
  inputSchema: TInputSchema
  isAvailable?: (context: ToolExecutionContext) => Promise<boolean> | boolean
  execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown> | unknown
}

/**
 * Declares a set of plugin tools in one call.
 *
 * Use when:
 * - A plugin registers all of its tools during bootstrap
 *
 * Expects:
 * - `ctx.apis.tools.register` is available from the host
 *
 * Returns:
 * - Resolves once every tool has been registered with the host
 */
export interface DefineToolsetOptions<TInputSchema = unknown> {
  tools: Array<PluginToolDefinition<TInputSchema>>
}

function createToolExecutionContext(): ToolExecutionContext {
  return {
    gamelets: {
      async open() {},
      async configure() {},
      async close() {},
      isOpen: () => false,
    },
  }
}

/**
 * Checks whether one unknown value already looks like a JSON Schema root object.
 *
 * Use when:
 * - Tool authoring code may pass either a prebuilt JSON Schema or a Standard Schema
 *
 * Expects:
 * - JSON Schema roots are plain objects and commonly include `type`, `properties`, or `$schema`
 *
 * Returns:
 * - `true` when the value should be cloned directly instead of converted with `toJsonSchema`
 */
function isJsonSchemaRecord(inputSchema: unknown): inputSchema is JsonSchema {
  if (!inputSchema || typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
    return false
  }

  return 'type' in inputSchema || 'properties' in inputSchema || '$schema' in inputSchema || '$ref' in inputSchema
}

/**
 * Checks whether one unknown value implements the Standard Schema contract.
 *
 * Use when:
 * - Tool authoring code passes a Valibot or other standard-schema-compatible validator
 *
 * Expects:
 * - Standard schemas expose the `~standard` marker used by `xsschema`
 *
 * Returns:
 * - `true` when the value can be converted by {@link toJsonSchema}
 */
function isStandardSchema(inputSchema: unknown): inputSchema is StandardSchemaV1 {
  return Boolean(
    inputSchema
    && typeof inputSchema === 'object'
    && '~standard' in inputSchema,
  )
}

/**
 * Validates that one plain object can cross the plugin-host boundary as `HostDataRecord`.
 *
 * Before:
 * - A generic schema-shaped object with unknown property value types
 *
 * After:
 * - The same object narrowed to `HostDataRecord` after runtime validation succeeds
 */
function toHostDataRecord(value: object): HostDataRecord {
  parse(hostDataRecordSchema, value)

  return value as HostDataRecord
}

/**
 * Normalizes tool parameter schemas into the host-safe record shape expected by plugin-sdk.
 *
 * Before:
 * - A Standard Schema instance or a JSON Schema-like authoring object
 *
 * After:
 * - A validated `HostDataRecord` safe to store in the host tool registry
 */
async function serializeToolParameters(inputSchema: unknown): Promise<HostDataRecord> {
  if (isStandardSchema(inputSchema)) {
    return toHostDataRecord(await toJsonSchema(inputSchema))
  }

  if (isJsonSchemaRecord(inputSchema)) {
    return toHostDataRecord(structuredClone(inputSchema))
  }

  throw new TypeError('Tool input schema must be a JSON Schema object or a Standard Schema instance.')
}

/**
 * Registers one or more plugin tools with the tamagotchi host wrapper.
 *
 * Use when:
 * - A plugin wants to declare xsai-compatible tools without low-level host records
 *
 * Expects:
 * - The caller supplies stable tool ids and schemas
 *
 * Returns:
 * - Resolves after all tool registrations complete
 */
export async function defineToolset(
  ctx: Pick<ContextInit, 'apis'>,
  options: DefineToolsetOptions,
): Promise<void> {
  const executionContext = createToolExecutionContext()

  for (const definition of options.tools) {
    await ctx.apis.tools.register({
      tool: {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        activation: {
          keywords: definition.activation?.keywords ?? [],
          patterns: (definition.activation?.patterns ?? []).map(pattern => pattern.source),
        },
        parameters: await serializeToolParameters(definition.inputSchema),
      },
      availability: definition.isAvailable
        ? () => definition.isAvailable?.(executionContext)
        : undefined,
      execute: input => definition.execute(input, executionContext),
    })
  }
}
