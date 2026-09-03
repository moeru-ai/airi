import type { KitClientRuntime } from '@proj-airi/plugin-sdk'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'
import type { JsonSchema, Schema as StandardSchemaV1 } from 'xsschema'

import type { ToolRegistryRecord, ToolsetPromptRegistryRecord } from './registry'

import { defineKit } from '@proj-airi/plugin-sdk'
import { hostDataRecordSchema } from '@proj-airi/plugin-sdk/plugin-host'
import { parse } from 'valibot'
import { toJsonSchema } from 'xsschema'

export type {
  RegisteredStageToolDescriptor,
  SerializedToolsetPromptDefinition,
  SerializedXsaiToolDefinition,
  SerializedXsaiToolsetDefinition,
  ToolRegistryRecord,
  ToolsetPromptManifest,
  ToolsetPromptRegistryRecord,
} from './registry'
export { StageToolRegistry } from './registry'

/** Optional discovery metadata for a stage extension tool. */
export interface PluginToolActivationDefinition {
  keywords?: string[]
  patterns?: RegExp[]
}

/** One high-level model tool declaration from an extension. */
export interface PluginToolDefinition<TInputSchema = unknown> {
  id: string
  title: string
  description: string
  activation?: PluginToolActivationDefinition
  inputSchema: TInputSchema
  isAvailable?: () => Promise<boolean> | boolean
  execute: (input: unknown) => Promise<unknown> | unknown
}

/** Shared prompt registration from one extension toolset. */
export interface PluginToolsetPromptRegistration {
  id: string
  prompt: import('./registry').ToolsetPromptManifest
}

/** Module-scoped model tool client exposed by {@link toolKit}. */
export interface ToolKitClient<TInputSchema = unknown> {
  registerTool: (definition: PluginToolDefinition<TInputSchema>) => Promise<void>
  registerToolsetPrompt: (registration: PluginToolsetPromptRegistration) => Promise<void>
}

/** Host services required by the platform-neutral tool kit. */
export interface ToolKitRuntime extends KitClientRuntime {
  tools?: {
    register: (input: Omit<ToolRegistryRecord, 'ownerExtensionId' | 'ownerModuleId' | 'ownerSessionId'>) => Promise<void> | void
    registerToolsetPrompt: (input: Omit<ToolsetPromptRegistryRecord, 'ownerExtensionId' | 'ownerModuleId' | 'ownerSessionId'>) => Promise<void> | void
  }
}

function isJsonSchemaRecord(input: unknown): input is JsonSchema {
  return Boolean(input && typeof input === 'object' && !Array.isArray(input)
    && ('type' in input || 'properties' in input || '$schema' in input || '$ref' in input))
}

function isStandardSchema(input: unknown): input is StandardSchemaV1 {
  return Boolean(input && typeof input === 'object' && '~standard' in input)
}

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
  }
  if (Array.isArray(next.type)) {
    next.type = next.type.includes('null') ? next.type : [...next.type, 'null']
    return next
  }
  if (typeof next.type === 'string') {
    next.type = next.type === 'null' ? next.type : [next.type, 'null']
    return next
  }
  if (Array.isArray(next.enum)) {
    return next
  }
  return {
    anyOf: [next, { type: 'null' }],
  }
}

function normalizeStrictToolParameterSchema(schema: JsonSchema): JsonSchema {
  const next: JsonSchema = { ...schema }
  if (next.properties) {
    const required = new Set(next.required ?? [])
    const properties = Object.fromEntries(Object.entries(next.properties).map(([key, value]) => {
      if (!isJsonSchemaNode(value)) {
        return [key, value]
      }
      const normalized = normalizeStrictToolParameterSchema(value)
      return [key, required.has(key) ? normalized : withNullableValue(normalized)]
    }))
    next.properties = properties
    next.required = Object.keys(properties)
  }
  if (Array.isArray(next.items)) {
    next.items = next.items.map(item => isJsonSchemaNode(item) ? normalizeStrictToolParameterSchema(item) : item)
  }
  else if (isJsonSchemaNode(next.items)) {
    next.items = normalizeStrictToolParameterSchema(next.items)
  }
  for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (next[key]) {
      next[key] = next[key].map(item => isJsonSchemaNode(item) ? normalizeStrictToolParameterSchema(item) : item)
    }
  }
  return next
}

async function serializeToolParameters(inputSchema: unknown): Promise<HostDataRecord> {
  if (isStandardSchema(inputSchema)) {
    return toHostDataRecord(normalizeStrictToolParameterSchema(await toJsonSchema(inputSchema)))
  }
  if (isJsonSchemaRecord(inputSchema)) {
    return toHostDataRecord(normalizeStrictToolParameterSchema(structuredClone(inputSchema)))
  }
  throw new TypeError('Tool input schema must be a JSON Schema object or a Standard Schema instance.')
}

/** The portable stage tool kit. */
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
          availability: definition.isAvailable,
          execute: definition.execute,
        })
      },
      async registerToolsetPrompt(registration) {
        if (!toolRuntime.tools) {
          throw new Error('toolKit requires a host tool registry runtime.')
        }
        await toolRuntime.tools.registerToolsetPrompt({ toolset: registration })
      },
    }
  },
})
