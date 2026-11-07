import type {
  ElectronMcpConfigFile,
  ElectronMcpHttpServerConfig,
  ElectronMcpServerConfig,
  ElectronMcpStdioServerConfig,
} from './eventa'

import { z } from 'zod'

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

/**
 * Checks that one string is an absolute `http` or `https` URL.
 *
 * Use when:
 * - Validating a remote endpoint in the main process or in the settings form
 *
 * Expects:
 * - `value` is user input and is not trusted
 *
 * Returns:
 * - `true` when the value parses and uses an allowed scheme
 */
export function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return false
  }
}

/**
 * Shared runtime-safe schema for one MCP stdio server definition.
 *
 * Use when:
 * - Validating `mcp.json` in the main process
 * - Validating JSON drafts before the renderer loads them into the form
 *
 * Expects:
 * - `command` is a non-empty string
 * - Optional fields must already conform to the persisted wire format
 *
 * Returns:
 * - A strict Zod schema matching the persisted MCP server shape
 */
export const electronMcpStdioServerConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  enabled: z.boolean().optional(),
}).strict() satisfies z.ZodType<ElectronMcpStdioServerConfig>

/**
 * Shared runtime-safe schema for one MCP HTTP server definition.
 *
 * Use when:
 * - Validating `mcp.json` in the main process
 * - Validating JSON drafts before the renderer loads them into the form
 *
 * Expects:
 * - `url` is an absolute `http` or `https` endpoint
 * - Optional fields must already conform to the persisted wire format
 *
 * Returns:
 * - A strict Zod schema matching the persisted remote server shape
 */
export const electronMcpHttpServerConfigSchema = z.object({
  // The main process fetches this URL on the user's behalf, so the scheme is
  // restricted here. A `file:` or `data:` URL would otherwise turn a pasted
  // config into a local read primitive.
  url: z.string().min(1).refine(isHttpUrl, { message: 'must be an absolute http or https URL' }),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
}).strict() satisfies z.ZodType<ElectronMcpHttpServerConfig>

/**
 * Shared runtime-safe schema for one MCP server definition of either transport.
 *
 * Use when:
 * - Validating a single server entry from a form or a JSON draft
 *
 * Expects:
 * - The entry matches exactly one transport shape
 *
 * Returns:
 * - A strict Zod schema for a stdio or HTTP server
 */
export const electronMcpServerConfigSchema = z.union([
  electronMcpStdioServerConfigSchema,
  electronMcpHttpServerConfigSchema,
]) satisfies z.ZodType<ElectronMcpServerConfig>

/**
 * Narrows one server configuration to the remote transport shape.
 *
 * Use when:
 * - Main and renderer must branch on the transport
 *
 * Expects:
 * - `config` already passed {@link electronMcpServerConfigSchema}
 *
 * Returns:
 * - `true` for a remote server, `false` for a spawned one
 */
export function isHttpServerConfig(config: ElectronMcpServerConfig): config is ElectronMcpHttpServerConfig {
  return 'url' in config
}

/**
 * Shared runtime-safe schema for the persisted MCP config file.
 *
 * Use when:
 * - Parsing `mcp.json` from disk
 * - Parsing JSON drafts in the settings page
 *
 * Expects:
 * - The root object contains only `mcpServers`
 * - Each server entry matches {@link electronMcpServerConfigSchema}
 *
 * Returns:
 * - A strict Zod schema for the full MCP config file
 */
export const electronMcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), electronMcpServerConfigSchema),
}).strict() satisfies z.ZodType<ElectronMcpConfigFile>

/**
 * Expands one union failure into the branch failure that explains it.
 *
 * A server entry is a union of the stdio shape and the HTTP shape. Zod reports a
 * bare "Invalid input" when it cannot tell which shape the user meant, and that
 * message tells the user nothing. The branch with the fewest problems is the one
 * the user most likely meant, so its issues are reported instead.
 *
 * Before:
 * - `{ code: 'invalid_union', message: 'Invalid input', errors: [[...], [...]] }`
 *
 * After:
 * - The closest branch's issues, each prefixed with the path of the union
 *
 * Use when:
 * - Formatting validation failures for the settings page or the main process
 *
 * Expects:
 * - `issue` comes from Zod validation of the MCP config schema
 *
 * Returns:
 * - The issue itself, or the closest branch's issues
 */
function expandIssue(issue: z.ZodIssue): z.ZodIssue[] {
  if (issue.code !== 'invalid_union')
    return [issue]

  const branches = issue.errors.filter(branch => branch.length > 0)
  if (branches.length === 0)
    return [issue]

  const closest = branches.reduce((best, branch) => branch.length < best.length ? branch : best)
  return closest.map(branchIssue => ({ ...branchIssue, path: [...issue.path, ...branchIssue.path] }))
}

/**
 * Formats schema validation issues into one user-facing error string.
 *
 * Before:
 * - `[{ path: ['mcpServers', 'fs', 'command'], message: 'Too small...' }]`
 *
 * After:
 * - `"mcpServers.fs.command: Too small..."`
 *
 * Use when:
 * - Returning validation failures to the main process or renderer UI
 *
 * Expects:
 * - Issues come from Zod validation of the MCP config schema
 *
 * Returns:
 * - A semicolon-delimited message preserving issue paths
 */
export function formatElectronMcpConfigIssues(issues: z.ZodIssue[]) {
  return issues
    .flatMap(expandIssue)
    .map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ')
}

/**
 * Parses a plain object into a validated MCP config file.
 *
 * Use when:
 * - JSON text has already been parsed
 * - Main and renderer need one shared validation entrypoint
 *
 * Expects:
 * - `value` is the result of `JSON.parse` or another plain object source
 *
 * Returns:
 * - A validated `ElectronMcpConfigFile`
 */
export function parseElectronMcpConfig(value: unknown): ElectronMcpConfigFile {
  const validated = electronMcpConfigSchema.safeParse(value)
  if (!validated.success) {
    throw new Error(formatElectronMcpConfigIssues(validated.error.issues))
  }

  return validated.data
}

/**
 * Parses JSON text into a validated MCP config file.
 *
 * Use when:
 * - Reading `mcp.json` from disk
 * - Applying raw JSON drafts in the renderer
 *
 * Expects:
 * - `text` contains JSON text for an MCP config file
 *
 * Returns:
 * - A validated `ElectronMcpConfigFile`
 */
export function parseElectronMcpConfigText(text: string): ElectronMcpConfigFile {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  }
  catch (error) {
    throw new Error(`invalid JSON: ${stringifyError(error)}`)
  }

  return parseElectronMcpConfig(parsed)
}
