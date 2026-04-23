import type {
  ElectronMcpStdioConfigFile,
  ElectronMcpStdioServerConfig,
} from '../../../../shared/eventa'

type TranslateMcpMessage = (key: string, params?: Record<string, unknown>) => string

/**
 * Editable MCP server form state used by the settings page.
 *
 * Use when:
 * - Rendering one MCP server card in the settings UI
 * - Converting between `mcp.json` and form-friendly fields
 *
 * Expects:
 * - `rowId` is only stable within the current page session
 * - User-entered strings may still contain leading or trailing whitespace
 *
 * Returns:
 * - A mutable UI model for one MCP server entry
 */
export interface ServerForm {
  rowId: string
  identifier: string
  command: string
  argsText: string
  envEntries: { key: string, value: string }[]
  cwd: string
  enabled: boolean
}

/**
 * Loaded MCP server rows derived from persisted config.
 *
 * Use when:
 * - Rebuilding the page state from disk or JSON draft input
 * - Restoring saved rows while preserving the test target selection
 *
 * Expects:
 * - `selectedRowId` may be empty when there are no loaded servers
 *
 * Returns:
 * - The regenerated server rows, their saved row ids, and the active test target
 */
export interface LoadedServerForms {
  servers: ServerForm[]
  savedIds: Set<string>
  selectedRowId: string
}

function makeRowId() {
  return `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function splitArgsText(argsText: string) {
  return argsText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

function envToObject(entries: { key: string, value: string }[]) {
  const out: Record<string, string> = {}
  for (const { key, value } of entries) {
    const normalizedKey = key.trim()
    if (normalizedKey)
      out[normalizedKey] = value
  }
  return out
}

/**
 * Creates a blank MCP server row for new entries.
 *
 * Use when:
 * - The user clicks "Add server"
 * - The page needs a fresh editable form model
 *
 * Expects:
 * - The returned row will be edited in place by Vue form bindings
 *
 * Returns:
 * - A new enabled server row with a unique session-local `rowId`
 */
export function createServerForm(): ServerForm {
  return {
    rowId: makeRowId(),
    identifier: '',
    command: '',
    argsText: '',
    envEntries: [],
    cwd: '',
    enabled: true,
  }
}

/**
 * Resolves the persisted server identifier for a selected row.
 *
 * Use when:
 * - Reloading rows from disk regenerates `rowId` values
 * - The page needs to preserve selection by stable server identity
 *
 * Expects:
 * - `rowId` may be stale or empty after a reload
 *
 * Returns:
 * - The matching identifier, or `undefined` when the row is no longer present
 */
export function findServerIdentifierByRowId(servers: ServerForm[], rowId: string) {
  return servers.find(server => server.rowId === rowId)?.identifier.trim() || undefined
}

/**
 * Converts one editable server row into persisted MCP server config.
 *
 * Use when:
 * - Writing `mcp.json`
 * - Running an in-app connection test for a single server
 *
 * Expects:
 * - Validation of required fields happens before or after this conversion
 *
 * Returns:
 * - A normalized stdio server config with trimmed args, env keys, and `cwd`
 */
export function buildServerConfig(server: ServerForm): ElectronMcpStdioServerConfig {
  const config: ElectronMcpStdioServerConfig = {
    command: server.command.trim(),
  }

  const args = splitArgsText(server.argsText)
  if (args.length)
    config.args = args

  const env = envToObject(server.envEntries)
  if (Object.keys(env).length)
    config.env = env

  if (server.cwd.trim())
    config.cwd = server.cwd.trim()

  if (!server.enabled)
    config.enabled = false

  return config
}

/**
 * Builds the persisted MCP config file from editable rows.
 *
 * Use when:
 * - Saving the settings form to disk
 * - Comparing the current form state against the last saved signature
 *
 * Expects:
 * - Each server must have a unique non-empty identifier
 * - Each server must include a non-empty command
 *
 * Returns:
 * - A normalized `mcp.json` object keyed by server identifier
 */
export function buildConfigFile(
  servers: ServerForm[],
  translateMessage: TranslateMcpMessage,
): ElectronMcpStdioConfigFile {
  const config: ElectronMcpStdioConfigFile = { mcpServers: {} }
  const seenIdentifiers = new Set<string>()

  for (const [index, server] of servers.entries()) {
    const identifier = server.identifier.trim()
    if (!identifier)
      throw new Error(translateMessage('errors.empty-identifier', { index: index + 1 }))

    if (seenIdentifiers.has(identifier))
      throw new Error(translateMessage('errors.duplicate-identifier', { name: identifier }))

    if (!server.command.trim())
      throw new Error(translateMessage('errors.empty-command', { name: identifier }))

    seenIdentifiers.add(identifier)
    config.mcpServers[identifier] = buildServerConfig(server)
  }

  return config
}

/**
 * Loads editable rows from persisted MCP config.
 *
 * Before:
 * - `{ "mcpServers": { "filesystem": { "command": "npx" } } }`
 *
 * After:
 * - `[ { rowId: "mcp-...", identifier: "filesystem", command: "npx" } ]`
 *
 * Use when:
 * - Parsing `mcp.json` from disk
 * - Applying a JSON draft back into the form
 *
 * Expects:
 * - `selectedIdentifier` should be a stable server identifier when selection must survive reloads
 *
 * Returns:
 * - Fresh UI rows plus the matching saved ids and restored selected row id
 */
export function loadServerForms(
  config: ElectronMcpStdioConfigFile,
  options: { selectedIdentifier?: string } = {},
): LoadedServerForms {
  const servers = Object.entries(config.mcpServers ?? {}).map(([identifier, server]) => ({
    rowId: makeRowId(),
    identifier,
    command: server.command,
    argsText: (server.args ?? []).join('\n'),
    envEntries: Object.entries(server.env ?? {}).map(([key, value]) => ({ key, value })),
    cwd: server.cwd ?? '',
    enabled: server.enabled !== false,
  }))

  const selectedRowId = options.selectedIdentifier
    ? (servers.find(server => server.identifier === options.selectedIdentifier)?.rowId ?? servers[0]?.rowId ?? '')
    : (servers[0]?.rowId ?? '')

  return {
    servers,
    savedIds: new Set(servers.map(server => server.rowId)),
    selectedRowId,
  }
}

/**
 * Previews the command line assembled from one server row.
 *
 * Before:
 * - command=`"npx"`, argsText=`"-y\n@modelcontextprotocol/server-filesystem"`
 *
 * After:
 * - `"npx -y @modelcontextprotocol/server-filesystem"`
 *
 * Use when:
 * - Rendering compact server summary rows in the settings page
 *
 * Expects:
 * - Empty parts are ignored
 *
 * Returns:
 * - A single-line command preview string
 */
export function previewServerCommand(server: ServerForm) {
  return [server.command, ...splitArgsText(server.argsText)].join(' ')
}
