import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import { errorMessageFromValue } from '@proj-airi/stage-shared'
import { rawTool, tool } from '@xsai/tool'
import { z } from 'zod'

/**
 * Describes an MCP tool that can be exposed to the shared LLM runtime.
 *
 * Use when:
 * - A runtime needs to list available MCP tools before exposing them to models
 *
 * Expects:
 * - `name` is the fully-qualified `"<server>::<tool>"` reference used for invocation
 *
 * Returns:
 * - The MCP tool descriptor metadata reported by the runtime
 */
export interface McpToolDescriptor {
  serverName: string
  name: string
  toolName: string
  description?: string
  inputSchema: Record<string, unknown>
}

/**
 * Payload for invoking an MCP tool through a runtime-specific transport.
 *
 * Use when:
 * - A runtime needs to forward a tool invocation into the MCP layer
 *
 * Expects:
 * - `name` matches a descriptor returned from `listTools`
 * - `arguments` is a JSON-compatible object when provided
 *
 * Returns:
 * - The MCP tool call input envelope
 */
export interface McpCallToolPayload {
  name: string
  arguments?: Record<string, unknown>
}

/**
 * Result returned from an MCP tool invocation.
 *
 * Use when:
 * - An MCP runtime returns tool output back to the shared LLM layer
 *
 * Expects:
 * - Error responses set `isError` when the tool execution failed
 *
 * Returns:
 * - Structured and unstructured MCP tool output
 */
export interface McpCallToolResult {
  content?: Array<Record<string, unknown>>
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
  isError?: boolean
}

/**
 * Runtime contract for wiring MCP tool discovery and execution into `stage-ui`.
 *
 * Use when:
 * - A concrete runtime such as Electron needs to provide MCP access without a singleton bridge
 *
 * Expects:
 * - `listTools` and `callTool` are safe to call multiple times
 *
 * Returns:
 * - An object that can back the MCP toolset
 */
export interface McpToolRuntime {
  listTools: () => Promise<McpToolDescriptor[]>
  callTool: (payload: McpCallToolPayload) => Promise<McpCallToolResult>
}

/** Prefix on a first-class (native) MCP tool's function name, so it never collides with built-ins. */
const NATIVE_TOOL_PREFIX = 'mcp__'
/** Catalog / one-line description cap (keeps the always-in-context awareness layer compact). */
const ONE_LINE_MAX = 120

/**
 * Normalizes a (possibly multi-line / verbose) MCP tool description into one compact line for the
 * always-in-context awareness catalog.
 *
 * Before:
 * - "Read a file.\nHandles encodings.\nExample: {...}"
 *
 * After:
 * - "Read a file."
 */
export function normalizeOneLine(description?: string): string {
  const flat = (description ?? '').replace(/\s+/g, ' ').trim()
  if (!flat)
    return ''
  // Prefer the first sentence; fall back to the whole (flattened) string, then hard-cap the length.
  const sentence = flat.match(/^.*?[.!?。！]/)?.[0]
  const text = sentence && sentence.length <= ONE_LINE_MAX ? sentence : flat
  return text.length > ONE_LINE_MAX ? `${text.slice(0, ONE_LINE_MAX - 1).trimEnd()}…` : text
}

/**
 * Deterministic, function-name-safe name for an MCP tool reference, prefixed so it never collides
 * with built-in tools.
 *
 * Before:
 * - "filesystem::read_file"
 *
 * After:
 * - "mcp__filesystem__read_file"
 */
export function sanitizeMcpToolName(ref: string): string {
  // Replace each invalid char individually (no `+`) so the `::` separator becomes a readable `__`.
  const safe = ref.replace(/[^\w-]/g, '_').replace(/^_+|_+$/g, '')
  return `${NATIVE_TOOL_PREFIX}${safe || 'tool'}`
}

/**
 * Builds a stable `ref -> native function name` map, disambiguating the rare case where two refs
 * sanitize to the same name (a numeric suffix is appended). Order-stable so names persist across runs.
 */
export function buildMcpNativeNames(refs: string[]): Map<string, string> {
  const used = new Set<string>()
  const map = new Map<string, string>()
  for (const ref of refs) {
    const base = sanitizeMcpToolName(ref)
    let name = base
    for (let i = 2; used.has(name); i++)
      name = `${base}_${i}`
    used.add(name)
    map.set(ref, name)
  }
  return map
}

/**
 * Renders the always-in-context awareness catalog: one line per MCP tool that is NOT yet a first-class
 * (activated) tool. Gives the model awareness of every cold capability without loading its schema.
 *
 * Returns an empty string when there are no cold tools (every tool is already first-class).
 */
export function renderMcpCatalog(descriptors: McpToolDescriptor[], activatedRefs: Set<string>): string {
  const cold = descriptors.filter(descriptor => !activatedRefs.has(descriptor.name))
  if (cold.length === 0)
    return ''

  const lines = cold.map((descriptor) => {
    const description = normalizeOneLine(descriptor.description)
    return description ? `- ${descriptor.name} — ${description}` : `- ${descriptor.name}`
  })

  return [
    'Capabilities available via MCP. To use one of these, call builtIn_mcpCallTool with its `name` below —',
    'the names contain "::" and are references, NOT directly callable functions (never emit a "::" tool call).',
    'A capability you have used before instead appears directly in your tool list as an `mcp__…` tool — call',
    'that one by name. Available references:',
    '',
    ...lines,
  ].join('\n')
}

/** Calls an MCP tool by reference with parsed arguments. Shared by the `call` meta-tool and every native MCP tool. */
async function executeMcpCall(runtime: McpToolRuntime, name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
  try {
    return await runtime.callTool({ name, arguments: args })
  }
  catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: errorMessageFromValue(error) }],
    }
  }
}

/** Builds a first-class (native) tool from an MCP descriptor, executed through the approval-aware path. */
function descriptorToNativeTool(runtime: McpToolRuntime, descriptor: McpToolDescriptor, name: string): Tool {
  return rawTool<Record<string, unknown>>({
    name,
    description: descriptor.description,
    // MCP descriptors already carry a JSON Schema. strict:false — MCP schemas rarely satisfy OpenAI's
    // strict function-calling shape (optional fields, additionalProperties), so pass it through as-is.
    parameters: descriptor.inputSchema as JsonSchema,
    strict: false,
    execute: args => executeMcpCall(runtime, descriptor.name, args ?? {}),
  })
}

/**
 * The two always-present MCP meta-tools (the "cold path"): discover schemas on demand and run any tool
 * by reference. A successful `call` of a tool reports it through `onToolInvoked` so the host can promote
 * it to a native first-class tool.
 */
export function createMcpMetaTools(runtime: McpToolRuntime, onToolInvoked?: (ref: string) => void): Array<Promise<Tool>> {
  return [
    tool({
      name: 'builtIn_mcpListTools',
      description: 'Discover the available MCP tools. Returns a list of tool references, each with a `name` like "<server>::<tool>" (e.g. "filesystem::read_file"), a description, and an input schema. IMPORTANT: a "<server>::<tool>" reference is NOT a directly callable function — never emit a tool call whose name contains "::". To run one, pass the reference to builtIn_mcpCallTool. A capability you have used before may already be a direct `mcp__…` tool in your tool list — prefer calling that one by name.',
      execute: async () => {
        try {
          return await runtime.listTools()
        }
        catch (error) {
          console.warn('[builtIn_mcpListTools] failed to list tools:', error)
          return ''
        }
      },
      parameters: z.object({}).strict(),
    }),
    tool({
      name: 'builtIn_mcpCallTool',
      description: 'Run an MCP tool that is in the MCP catalog but NOT already a direct tool in your tool list. Set `name` to the reference (e.g. "filesystem::read_file") and `arguments` to a JSON string of its inputs (e.g. "{}" or "{\\"path\\":\\"D:/airi-files\\"}"). Do NOT call a "<server>::<tool>" name directly — it is not a registered function; pass it here instead. NOTE: a capability you have used before is registered directly in your tool list under an `mcp__…` name — when one exists, call that directly and do not route it through this tool.',
      execute: async ({ name, arguments: argsJson }) => {
        let args: Record<string, unknown>
        try {
          args = argsJson ? JSON.parse(argsJson) : {}
        }
        catch (error) {
          // Report malformed arguments back to the model as a tool error rather than throwing — a
          // throw would abort the whole turn instead of letting the model retry with valid JSON.
          return {
            isError: true,
            content: [{ type: 'text', text: `Invalid JSON in arguments: ${errorMessageFromValue(error)}` }],
          }
        }
        const result = await executeMcpCall(runtime, name, args)
        // A tool the model actually used (successfully) is worth promoting to a native first-class
        // tool — from the next turn it is callable directly, no `::` wrapper, no double-encoded args.
        if (!result.isError)
          onToolInvoked?.(name)
        return result
      },
      // NOTICE: `arguments` is z.string() (JSON) because z.unknown() produces `{}` (no `type` key)
      // and z.record() emits `propertyNames`, both rejected by OpenAI.
      parameters: z.object({
        name: z.string().describe('Tool name in "<serverName>::<toolName>" format'),
        arguments: z.string().describe('JSON object of tool arguments, e.g. {"query":"hello","limit":10}'),
      }).strict(),
    }),
  ]
}

/** Options for {@link createMcpToolset}. */
export interface McpToolsetOptions {
  /** Refs (`"<server>::<tool>"`) already activated — exposed as native first-class tools. */
  activatedRefs: Set<string>
  /** Reports a tool the model just used so the host can persist it as activated. */
  onToolInvoked?: (ref: string) => void
}

/** The progressively-disclosed MCP toolset: native tools + meta-tools, plus the awareness catalog. */
export interface McpToolset {
  /** Native first-class tools (for activated refs) followed by the two meta-tools. */
  tools: Tool[]
  /** Awareness-catalog prompt text for the cold (not-yet-activated) tools; empty when none. */
  catalog: string
}

/**
 * Builds the progressive-disclosure MCP toolset for one launch/refresh.
 *
 * Use when:
 * - The desktop runtime registers MCP tools and needs both the callable tools and the prompt catalog
 *
 * Expects:
 * - `runtime` lists live descriptors and executes calls
 * - `options.activatedRefs` is the persisted set of tools to expose natively
 *
 * Returns:
 * - `tools` (native activated tools + the two meta-tools) and `catalog` (one-liner awareness text for
 *   the cold tools). Activated tools are rebuilt from the live descriptors, so their schemas are always
 *   current; a previously-activated tool whose descriptor is gone simply isn't built (it re-activates
 *   if it returns).
 */
export async function createMcpToolset(runtime: McpToolRuntime, options: McpToolsetOptions): Promise<McpToolset> {
  let descriptors: McpToolDescriptor[] = []
  try {
    const listed = await runtime.listTools()
    descriptors = Array.isArray(listed) ? listed : []
  }
  catch (error) {
    console.warn('[mcp-toolset] failed to list tools:', error)
  }

  const activated = descriptors.filter(descriptor => options.activatedRefs.has(descriptor.name))
  const nameMap = buildMcpNativeNames(activated.map(descriptor => descriptor.name))
  const nativeTools = activated.map(descriptor => descriptorToNativeTool(runtime, descriptor, nameMap.get(descriptor.name)!))
  const metaTools = await Promise.all(createMcpMetaTools(runtime, options.onToolInvoked))

  return {
    tools: [...nativeTools, ...metaTools],
    catalog: renderMcpCatalog(descriptors, options.activatedRefs),
  }
}

function createUnavailableMcpToolRuntime(): McpToolRuntime {
  return {
    async listTools() {
      throw new Error('MCP tools are not available in this runtime.')
    },
    async callTool() {
      throw new Error('MCP tools are not available in this runtime.')
    },
  }
}

/**
 * Builds the default stage-ui MCP meta-tools without depending on runtime singletons.
 *
 * Use when:
 * - Shared code needs the MCP tool schema before a concrete runtime registers live implementations
 *
 * Expects:
 * - Runtime-specific callers override these tools through `useLlmToolsStore`
 *
 * Returns:
 * - The two MCP meta-tools with an unavailable-runtime fallback
 */
export async function mcp(): Promise<Tool[]> {
  return await Promise.all(createMcpMetaTools(createUnavailableMcpToolRuntime()))
}
