import type {
  ElectronMcpConfigFile,
  ElectronMcpHttpServerConfig,
  ElectronMcpServerConfig,
  ElectronMcpStdioServerConfig,
} from '../../../../shared/eventa'

import { isHttpServerConfig, isHttpUrl } from '../../../../shared/mcp-config'

type TranslateMcpMessage = (key: string, params?: Record<string, unknown>) => string

/** Transport that one editable server row describes. */
export type ServerTransport = 'stdio' | 'http'

interface KeyValueEntry {
  key: string
  value: string
}

/**
 * Editable MCP server form state used by the settings page.
 *
 * Both transport shapes stay in the row while the user edits it. Switching the
 * transport back and forth therefore keeps what was typed on each side.
 */
export interface ServerForm {
  rowId: string
  identifier: string
  transport: ServerTransport
  command: string
  argsText: string
  envEntries: KeyValueEntry[]
  cwd: string
  url: string
  headerEntries: KeyValueEntry[]
  enabled: boolean
}

/** Editable MCP server rows derived from persisted config. */
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

function entriesToObject(entries: KeyValueEntry[]) {
  const out: Record<string, string> = {}
  for (const { key, value } of entries) {
    const normalizedKey = key.trim()
    if (normalizedKey)
      out[normalizedKey] = value
  }
  return out
}

function objectToEntries(values: Record<string, string> | undefined): KeyValueEntry[] {
  return Object.entries(values ?? {}).map(([key, value]) => ({ key, value }))
}

/** Creates a blank MCP server row for new entries. */
export function createServerForm(): ServerForm {
  return {
    rowId: makeRowId(),
    identifier: '',
    transport: 'stdio',
    command: '',
    argsText: '',
    envEntries: [],
    cwd: '',
    url: '',
    headerEntries: [],
    enabled: true,
  }
}

/** Resolves the persisted server identifier for a selected row. */
export function findServerIdentifierByRowId(servers: ServerForm[], rowId: string) {
  return servers.find(server => server.rowId === rowId)?.identifier.trim() || undefined
}

/** Converts one editable server row into persisted MCP server config. */
export function buildServerConfig(server: ServerForm): ElectronMcpServerConfig {
  if (server.transport === 'http') {
    const config: ElectronMcpHttpServerConfig = {
      url: server.url.trim(),
    }

    const headers = entriesToObject(server.headerEntries)
    if (Object.keys(headers).length)
      config.headers = headers

    if (!server.enabled)
      config.enabled = false

    return config
  }

  const config: ElectronMcpStdioServerConfig = {
    command: server.command.trim(),
  }

  const args = splitArgsText(server.argsText)
  if (args.length)
    config.args = args

  const env = entriesToObject(server.envEntries)
  if (Object.keys(env).length)
    config.env = env

  if (server.cwd.trim())
    config.cwd = server.cwd.trim()

  if (!server.enabled)
    config.enabled = false

  return config
}

/**
 * Reports why one row cannot be saved or tested yet.
 *
 * Before:
 * - A remote row with an empty or non-HTTP URL only fails once the main process
 *   rejects the config file
 *
 * After:
 * - The form reports the problem while the user is still editing
 *
 * Use when:
 * - Building the persisted config, and before a connection test
 *
 * Expects:
 * - `translateMessage` resolves the settings page messages
 *
 * Returns:
 * - A message to show, or `undefined` when the row is complete
 */
export function validateServerForm(server: ServerForm, translateMessage: TranslateMcpMessage): string | undefined {
  const name = server.identifier.trim() || '?'

  if (server.transport === 'http') {
    const url = server.url.trim()
    if (!url)
      return translateMessage('errors.empty-url', { name })
    if (!isHttpUrl(url))
      return translateMessage('errors.invalid-url', { name })
    return undefined
  }

  if (!server.command.trim())
    return translateMessage('errors.empty-command', { name })

  return undefined
}

/** Builds the persisted MCP config file from editable rows. */
export function buildConfigFile(
  servers: ServerForm[],
  translateMessage: TranslateMcpMessage,
): ElectronMcpConfigFile {
  const config: ElectronMcpConfigFile = { mcpServers: {} }
  const seenIdentifiers = new Set<string>()

  for (const [index, server] of servers.entries()) {
    const identifier = server.identifier.trim()
    if (!identifier)
      throw new Error(translateMessage('errors.empty-identifier', { index: index + 1 }))

    if (seenIdentifiers.has(identifier))
      throw new Error(translateMessage('errors.duplicate-identifier', { name: identifier }))

    const invalid = validateServerForm(server, translateMessage)
    if (invalid)
      throw new Error(invalid)

    seenIdentifiers.add(identifier)
    config.mcpServers[identifier] = buildServerConfig(server)
  }

  return config
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

/** Loads editable rows from persisted MCP config. */
export function loadServerForms(
  config: ElectronMcpConfigFile,
  options: { selectedIdentifier?: string } = {},
): LoadedServerForms {
  const servers = Object.entries(config.mcpServers ?? {}).map(([identifier, server]): ServerForm => {
    const common = {
      rowId: makeRowId(),
      identifier,
      command: '',
      argsText: '',
      envEntries: [],
      cwd: '',
      url: '',
      headerEntries: [],
      enabled: server.enabled !== false,
    }

    if (isHttpServerConfig(server)) {
      return {
        ...common,
        transport: 'http',
        url: server.url,
        headerEntries: objectToEntries(server.headers),
      }
    }

    return {
      ...common,
      transport: 'stdio',
      command: server.command,
      argsText: (server.args ?? []).join('\n'),
      envEntries: objectToEntries(server.env),
      cwd: server.cwd ?? '',
    }
  })

  const selectedRowId = options.selectedIdentifier
    ? (servers.find(server => server.identifier === options.selectedIdentifier)?.rowId ?? servers[0]?.rowId ?? '')
    : (servers[0]?.rowId ?? '')

  return {
    servers,
    savedIds: new Set(servers.map(server => server.rowId)),
    selectedRowId,
  }
}

/** Previews the command line or endpoint assembled from one server row. */
export function previewServerTarget(server: ServerForm) {
  if (server.transport === 'http')
    return server.url.trim()

  return [server.command, ...splitArgsText(server.argsText)].join(' ').trim()
}
