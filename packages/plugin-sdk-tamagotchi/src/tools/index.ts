import type { ContextInit } from '@proj-airi/plugin-sdk'
import type { HostDataRecord, ToolsetPromptManifest } from '@proj-airi/plugin-sdk/plugin-host'
import type { JsonSchema, Schema as StandardSchemaV1 } from 'xsschema'

import { hostDataRecordSchema } from '@proj-airi/plugin-sdk/plugin-host'
import { parse } from 'valibot'
import { toJsonSchema } from 'xsschema'

/**
 * Describes the stage-tamagotchi gamelet API expected on `ctx.apis`.
 *
 * Use when:
 * - Tool execution wants to open, configure, close, or inspect host-managed gamelet surfaces
 * - Runtime validation needs a structural contract independent from `@proj-airi/plugin-sdk`
 *
 * Expects:
 * - The stage-tamagotchi host contribution installs `gamelets` on the plugin session API object
 *
 * Returns:
 * - The host-backed gamelet control surface exposed to tool callbacks
 */
export interface ToolExecutionGameletApi {
  open: (id: string, params?: HostDataRecord) => Promise<void>
  configure: (id: string, patch: HostDataRecord) => Promise<void>
  request: (id: string, payload: HostDataRecord, options?: { timeoutMs?: number }) => Promise<HostDataRecord>
  close: (id: string) => Promise<void>
  isOpen: (id: string) => Promise<boolean> | boolean
}

/**
 * Describes the tamagotchi-flavored plugin context accepted by {@link defineToolset}.
 *
 * Use when:
 * - A plugin host exposes tool registration plus the stage-owned `gamelets` surface
 * - Tests want to model the runtime shape without relying on baked-in SDK typing
 *
 * Expects:
 * - `apis.tools.register` is available
 * - `apis.gamelets` is installed by the stage-tamagotchi host contribution
 *
 * Returns:
 * - A context shape compatible with the tamagotchi tool helper
 */
export interface TamagotchiToolContext {
  apis: Pick<ContextInit['apis'], 'tools'> & {
    gamelets: ToolExecutionGameletApi
  }
}

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
  gamelets: ToolExecutionGameletApi

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
  id?: string
  prompt?: ToolsetPromptManifest
  tools: Array<PluginToolDefinition<TInputSchema>>
}

function isToolExecutionGameletApi(value: unknown): value is ToolExecutionGameletApi {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<Record<keyof ToolExecutionGameletApi, unknown>>

  return typeof candidate.open === 'function'
    && typeof candidate.configure === 'function'
    && typeof candidate.request === 'function'
    && typeof candidate.close === 'function'
    && typeof candidate.isOpen === 'function'
}

function getToolExecutionGameletApi(
  ctx: Pick<ContextInit, 'apis'> | TamagotchiToolContext,
): ToolExecutionGameletApi {
  const gamelets = (ctx.apis as Record<string, unknown>).gamelets

  if (!isToolExecutionGameletApi(gamelets)) {
    throw new Error('stage-tamagotchi gamelet API is not available on `ctx.apis.gamelets`.')
  }

  return gamelets
}

function createToolExecutionContext(
  ctx: Pick<ContextInit, 'apis'> | TamagotchiToolContext,
): ToolExecutionContext {
  return {
    gamelets: getToolExecutionGameletApi(ctx),
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

function isJsonSchemaNode(value: JsonSchema | boolean | JsonSchema[] | undefined): value is JsonSchema {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object')
}

function withNullableValue(schema: JsonSchema): JsonSchema {
  const next: JsonSchema = { ...schema }

  if (Array.isArray(next.enum)) {
    next.enum = next.enum.includes(null) ? next.enum : [...next.enum, null]
    return next
  }

  if (Array.isArray(next.type)) {
    next.type = next.type.includes('null') ? next.type : [...next.type, 'null']
    return next
  }

  if (typeof next.type === 'string') {
    next.type = next.type === 'null' ? next.type : [next.type, 'null']
    return next
  }

  next.anyOf = [...(next.anyOf ?? []), { type: 'null' }]
  return next
}

/**
 * Normalizes plugin tool JSON Schema for strict OpenAI-compatible validators.
 *
 * Before:
 * - `{ properties: { optionalName: { type: "string" } }, required: [] }`
 *
 * After:
 * - `{ properties: { optionalName: { type: ["string", "null"] } }, required: ["optionalName"] }`
 */
function normalizeStrictToolParameterSchema(schema: JsonSchema): JsonSchema {
  const next: JsonSchema = { ...schema }

  if (next.properties) {
    const currentRequired = new Set(next.required ?? [])
    const normalizedProperties = Object.fromEntries(
      Object.entries(next.properties).map(([key, value]) => {
        if (!isJsonSchemaNode(value)) {
          return [key, value]
        }

        const normalizedValue = normalizeStrictToolParameterSchema(value)
        return [
          key,
          currentRequired.has(key)
            ? normalizedValue
            : withNullableValue(normalizedValue),
        ]
      }),
    )

    next.properties = normalizedProperties
    next.required = Object.keys(normalizedProperties)
  }

  if (Array.isArray(next.items)) {
    next.items = next.items.map(item => isJsonSchemaNode(item) ? normalizeStrictToolParameterSchema(item) : item)
  }
  else if (isJsonSchemaNode(next.items)) {
    next.items = normalizeStrictToolParameterSchema(next.items)
  }

  if (next.anyOf) {
    next.anyOf = next.anyOf.map(value => isJsonSchemaNode(value) ? normalizeStrictToolParameterSchema(value) : value)
  }

  if (next.oneOf) {
    next.oneOf = next.oneOf.map(value => isJsonSchemaNode(value) ? normalizeStrictToolParameterSchema(value) : value)
  }

  if (next.allOf) {
    next.allOf = next.allOf.map(value => isJsonSchemaNode(value) ? normalizeStrictToolParameterSchema(value) : value)
  }

  return next
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
    return toHostDataRecord(normalizeStrictToolParameterSchema(await toJsonSchema(inputSchema)))
  }

  if (isJsonSchemaRecord(inputSchema)) {
    return toHostDataRecord(normalizeStrictToolParameterSchema(structuredClone(inputSchema)))
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
  ctx: Pick<ContextInit, 'apis'> | TamagotchiToolContext,
  options: DefineToolsetOptions,
): Promise<void> {
  const executionContext = createToolExecutionContext(ctx)

  if (options.prompt) {
    await ctx.apis.tools.registerToolsetPrompt({
      id: options.id ?? options.prompt.id,
      prompt: options.prompt,
    })
  }

  for (const definition of options.tools) {
    const isAvailable = definition.isAvailable

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
      availability: isAvailable
        ? () => isAvailable(executionContext)
        : undefined,
      execute: input => definition.execute(input, executionContext),
    })
  }
}
