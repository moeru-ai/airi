import type {
  ElectronMcpStdioConfigFile,
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
 * Shared runtime-safe schema for the persisted MCP config file.
 *
 * Use when:
 * - Parsing `mcp.json` from disk
 * - Parsing JSON drafts in the settings page
 *
 * Expects:
 * - The root object contains only `mcpServers`
 * - Each server entry matches {@link electronMcpStdioServerConfigSchema}
 *
 * Returns:
 * - A strict Zod schema for the full MCP config file
 */
export const electronMcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), electronMcpStdioServerConfigSchema),
}).strict() satisfies z.ZodType<ElectronMcpStdioConfigFile>

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
  return issues.map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ')
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
 * - A validated `ElectronMcpStdioConfigFile`
 */
export function parseElectronMcpConfig(value: unknown): ElectronMcpStdioConfigFile {
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
 * - A validated `ElectronMcpStdioConfigFile`
 */
export function parseElectronMcpConfigText(text: string): ElectronMcpStdioConfigFile {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  }
  catch (error) {
    throw new Error(`invalid JSON: ${stringifyError(error)}`)
  }

  return parseElectronMcpConfig(parsed)
}
