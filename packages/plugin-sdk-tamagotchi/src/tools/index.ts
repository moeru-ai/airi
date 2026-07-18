import type { KitClientRuntime } from '@proj-airi/plugin-sdk'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'
import type { JsonSchema, Schema as StandardSchemaV1 } from 'xsschema'

import type {
  PluginToolDefinitionRecord,
  PluginToolsetPromptDefinitionRecord,
  ToolsetPromptManifest,
} from './registry'

import { defineKit } from '@proj-airi/plugin-sdk'
import { hostDataRecordSchema } from '@proj-airi/plugin-sdk/plugin-host'
import { parse } from 'valibot'
import { toJsonSchema } from 'xsschema'

export type {
  PluginToolDefinitionRecord,
  PluginToolsetPromptDefinitionRecord,
  RegisteredPluginToolDescriptor,
  SerializedToolsetPromptDefinition,
  SerializedXsaiToolDefinition,
  SerializedXsaiToolsetDefinition,
  ToolRegistryRecord,
  ToolsetPromptManifest,
  ToolsetPromptRegistryRecord,
} from './registry'
export { TamagotchiToolRegistry } from './registry'

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
 * - A friendly authoring record consumed by {@link ToolKitClient.registerTool}
 */
export interface PluginToolDefinition<TInputSchema = unknown> {
  id: string
  title: string
  description: string
  activation?: PluginToolActivationDefinition
  inputSchema: TInputSchema
  isAvailable?: () => Promise<boolean> | boolean
  execute: (input: unknown) => Promise<unknown> | unknown
}

/**
 * Describes one toolset prompt registration.
 */
export interface PluginToolsetPromptRegistration {
  id: string
  prompt: ToolsetPromptManifest
}

/**
 * Describes the module-scoped tool authoring client exposed by {@link toolKit}.
 *
 * @param TInputSchema - Schema implementation accepted by each tool definition.
 */
export interface ToolKitClient<TInputSchema = unknown> {
  /**
   * Registers one tool through the host-owned tool registry.
   */
  registerTool: (definition: PluginToolDefinition<TInputSchema>) => Promise<void>

  /**
   * Registers one toolset prompt through the host-owned tool registry.
   */
  registerToolsetPrompt: (registration: PluginToolsetPromptRegistration) => Promise<void>
}

/**
 * Describes host services required by the tool kit client.
 */
export interface ToolKitRuntime extends KitClientRuntime {
  /**
   * Host-owned tool registry operations.
   */
  tools?: {
    register: (input: {
      tool: PluginToolDefinitionRecord
      availability?: () => Promise<boolean> | boolean
      execute: (input: unknown) => Promise<unknown> | unknown
    }) => Promise<void> | void
    registerToolsetPrompt: (input: PluginToolsetPromptDefinitionRecord) => Promise<void> | void
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
 * Exposes tamagotchi tool registration as a module-scoped extension kit.
 *
 * Use when:
 * - An extension module wants to register tools through `module.kits.use(toolKit)`
 * - The host should keep tool transport, permission, and binding details outside authoring code
 *
 * Expects:
 * - The host provides tool registry APIs when creating the kit client
 *
 * Returns:
 * - A client that registers LLM tools without depending on domain-specific kits
 */
export const toolKit = defineKit<ToolKitClient>({
  id: 'kit.tool',
  version: '1.0.0',
  allowedExposePolicies: ['local-only', 'remote-observable'],
  defaultExposePolicy: 'local-only',
  createClient(runtime) {
    const toolRuntime = runtime as ToolKitRuntime

    return {
      async registerTool(definition) {
        if (!toolRuntime.tools) {
          throw new Error('toolKit requires a host tool registry runtime.')
        }

        const isAvailable = definition.isAvailable

        await toolRuntime.tools.register({
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
          availability: isAvailable,
          execute: definition.execute,
        })
      },
      async registerToolsetPrompt(registration) {
        if (!toolRuntime.tools) {
          throw new Error('toolKit requires a host tool registry runtime.')
        }

        await toolRuntime.tools.registerToolsetPrompt(registration)
      },
    }
  },
})
