import type {
  ElectronMcpStdioConfigFile,
  ElectronMcpStdioServerConfig,
} from '../../../../shared/eventa'

/** Editable MCP server rows derived from persisted config. */
export interface LoadedServerForms {
  savedIds: Set<string>
  selectedRowId: string
  servers: ServerForm[]
}

/** Editable MCP server form state used by the settings page. */
export interface ServerForm {
  argsText: string
  command: string
  cwd: string
  enabled: boolean
  envEntries: { key: string, value: string }[]
  identifier: string
  rowId: string
}

type TranslateMcpMessage = (key: string, params?: Record<string, unknown>) => string

/** Builds the persisted MCP config file from editable rows. */
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

/** Converts one editable server row into persisted MCP server config. */
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

/** Creates a blank MCP server row for new entries. */
export function createServerForm(): ServerForm {
  return {
    argsText: '',
    command: '',
    cwd: '',
    enabled: true,
    envEntries: [],
    identifier: '',
    rowId: makeRowId(),
  }
}

/** Resolves the persisted server identifier for a selected row. */
export function findServerIdentifierByRowId(servers: ServerForm[], rowId: string) {
  return servers.find(server => server.rowId === rowId)?.identifier.trim() || undefined
}

/** Loads editable rows from persisted MCP config. */
export function loadServerForms(
  config: ElectronMcpStdioConfigFile,
  options: { selectedIdentifier?: string } = {},
): LoadedServerForms {
  const servers = Object.entries(config.mcpServers ?? {}).map(([identifier, server]) => ({
    argsText: (server.args ?? []).join('\n'),
    command: server.command,
    cwd: server.cwd ?? '',
    enabled: server.enabled !== false,
    envEntries: Object.entries(server.env ?? {}).map(([key, value]) => ({ key, value })),
    identifier,
    rowId: makeRowId(),
  }))

  const selectedRowId = options.selectedIdentifier
    ? (servers.find(server => server.identifier === options.selectedIdentifier)?.rowId ?? servers[0]?.rowId ?? '')
    : (servers[0]?.rowId ?? '')

  return {
    savedIds: new Set(servers.map(server => server.rowId)),
    selectedRowId,
    servers,
  }
}

/** Previews the command line assembled from one server row. */
export function previewServerCommand(server: ServerForm) {
  return [server.command, ...splitArgsText(server.argsText)].join(' ')
}

/** Builds the JSON editor draft while preserving the current draft when form validation fails. */
export function syncJsonDraftFromServers(
  servers: ServerForm[],
  previousDraft: string,
  translateMessage: TranslateMcpMessage,
  formatError: (error: unknown) => string,
) {
  try {
    return {
      draft: `${JSON.stringify(buildConfigFile(servers, translateMessage), null, 2)}\n`,
      error: '',
    }
  }
  catch (error) {
    return {
      draft: previousDraft,
      error: formatError(error),
    }
  }
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

function makeRowId() {
  return `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function splitArgsText(argsText: string) {
  return argsText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}
