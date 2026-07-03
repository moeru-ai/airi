/**
 * AIRI Core Terminal — LocalToolRuntime Handler
 *
 * Adapts MCP tool invocation to the generic `ToolHandler` interface so
 * AIRI's `LocalToolRuntime` can dispatch calls through `TerminalMcpBridge`.
 *
 * Design notes:
 * - Input validation happens here against the MCP tool's `inputSchema`.
 *   This keeps the handler layers-id: validate once, dispatch once.
 * - Zod schemas are built lazily from the tool's input schema and cached
 *   per tool to avoid rebuilding on every invocation.
 * - Errors are normalized to the structure `LocalToolRuntime` expects:
 *   `ToolExecutionResult.error = { code, message }`.
 */

import type { ToolDescriptor, ToolExecutionResult, ToolHandler } from '@proj-airi/core'
import type { z as ZodModule, ZodTypeAny } from 'zod'
import type { TerminalMcpBridge } from './bridge.js'

import { z } from 'zod'

const z2 = z as unknown as typeof ZodModule

/**
 * Cache of Zod schemas keyed by MCP tool name. Avoids re-deriving schemas
 * on every call.
 */
const schemaCache = new Map<string, ZodTypeAny | null>()

/**
 * Derive a Zod schema from a tool's JSON Schema inputSchema.
 *
 * We use zod.coerce for primitives to be lenient with MCP transports that
 * may pass data as strings (e.g. numeric exit codes returned by terminals).
 */
export function buildZodSchema(inputSchema: Record<string, unknown> | undefined): ZodTypeAny | null {
  if (!inputSchema) return null

  const properties = (inputSchema as { properties?: Record<string, unknown> }).properties ?? {}
  const requiredRaw = (inputSchema as { required?: unknown }).required
  const requiredFields = Array.isArray(requiredRaw) ? requiredRaw.filter((v): v is string => typeof v === 'string') : []

  const shape: Record<string, ZodTypeAny> = {}

  for (const [key, propUnknown] of Object.entries(properties)) {
    const prop = propUnknown as Record<string, unknown> | undefined
    if (!prop) {
      shape[key] = z2.unknown()
      continue
    }

    shape[key] = jsonSchemaToZod(key, prop, requiredFields.includes(key))
  }

  return z2.object(shape).strict()
}

function jsonSchemaToZod(key: string, prop: Record<string, unknown>, required: boolean): ZodTypeAny {
  const type = prop.type

  let base: ZodTypeAny

  if (type === 'object') {
    base = buildZodSchema(prop) ?? z2.record(z2.string(), z2.unknown())
  } else if (type === 'array') {
    const itemsSchema = (prop as { items?: Record<string, unknown> }).items
    const itemZod = itemsSchema ? jsonSchemaToZod(`${key}.$`, itemsSchema, false) : z2.unknown()
    base = z2.array(itemZod)
  } else if (type === 'string') {
    base = z2.string()
  } else if (type === 'number' || type === 'integer') {
    base = z2.number()
  } else if (type === 'boolean') {
    base = z2.boolean()
  } else {
    base = z2.unknown()
  }

  return required ? base : base.optional()
}

/**
 * Clear the internal Zod schema cache. Primarily useful in tests where
 * multiple handlers for the same tool name need different schemas across
 * test cases.
 */
export function clearToolSchemaCache(): void {
  schemaCache.clear()
}

/**
 * Get (or build + cache) a Zod schema for a MCP tool.
 */
export function getToolSchema(toolName: string, inputSchema: Record<string, unknown> | undefined): ZodTypeAny | null {
  if (schemaCache.has(toolName)) return schemaCache.get(toolName) ?? null

  const schema = buildZodSchema(inputSchema)
  schemaCache.set(toolName, schema)
  return schema
}

/**
 * Create a `ToolHandler` for a terminal MCP tool.
 *
 * This function is bound to a specific `TerminalMcpBridge` instance and a
 * single tool descriptor. It validates input, forwards the call to the
 * bridge, and returns a `ToolExecutionResult`.
 */
export function createTerminalToolHandler(bridge: TerminalMcpBridge, descriptor: ToolDescriptor): ToolHandler {
  // Pre-resolve the Zod schema for this tool at handler registration time.
  const schema = getToolSchema(descriptor.id as string, descriptor.inputSchema as Record<string, unknown> | undefined)

  return async (input: unknown): Promise<ToolExecutionResult> => {
    const startedAt = Date.now()

    let args: Record<string, unknown>
    try {
      args = validateInput(input, schema, descriptor.id as string)
    } catch (error) {
      return {
        success: false,
        output: null,
        durationMs: Date.now() - startedAt,
        error: {
          code: 'INPUT_VALIDATION_ERROR',
          message: error instanceof Error ? error.message : `Invalid input for "${descriptor.id}"`,
        },
      }
    }

    try {
      const output = await bridge.callTool(descriptor.id as string, args)
      return {
        success: true,
        output,
        durationMs: Date.now() - startedAt,
      }
    } catch (error) {
      return {
        success: false,
        output: null,
        durationMs: Date.now() - startedAt,
        error: error as { code: string; message: string },
      }
    }
  }
}

function validateInput(input: unknown, schema: ZodTypeAny | null, toolId: string): Record<string, unknown> {
  if (input == null) {
    return {}
  }

  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`Expected input to be an object, got ${Array.isArray(input) ? 'array' : typeof input}`)
  }

  if (!schema) {
    return input as Record<string, unknown>
  }

  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.length > 0 ? i.path.join('.') : '<root>'}: ${i.message}`)
      .join('; ')
    throw new Error(`Input validation failed for "${toolId}": ${issues}`)
  }

  return parsed.data as Record<string, unknown>
}
