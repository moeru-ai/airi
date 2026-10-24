import type { ServerForm } from './mcp-config'

import { errorMessageFrom } from '@moeru/std'
import { describe, expect, it } from 'vitest'

import { parseElectronMcpConfigText } from '../../../../shared/mcp-config'
import {
  buildConfigFile,
  buildServerConfig,
  findServerIdentifierByRowId,
  loadServerForms,
  syncJsonDraftFromServers,
  validateServerForm,
} from './mcp-config'

function translateMessage(key: string, params?: Record<string, unknown>) {
  if (params?.name)
    return `${key}:${String(params.name)}`

  if (params?.index)
    return `${key}:${String(params.index)}`

  return key
}

function stdioFormRow(overrides: Partial<ServerForm> = {}): ServerForm {
  return {
    rowId: 'mcp-static',
    identifier: 'filesystem',
    transport: 'stdio',
    command: 'npx',
    argsText: '',
    envEntries: [],
    cwd: '',
    url: '',
    headerEntries: [],
    enabled: true,
    ...overrides,
  }
}

describe('mcp-config helpers', () => {
  it('preserves the selected server identity when rows are reloaded', () => {
    const config = {
      mcpServers: {
        filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
        github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
      },
    }

    const initialLoad = loadServerForms(config)
    const selectedRowId = initialLoad.servers[1]!.rowId
    const selectedIdentifier = findServerIdentifierByRowId(initialLoad.servers, selectedRowId)
    const reloaded = loadServerForms(config, { selectedIdentifier })

    expect(selectedIdentifier).toBe('github')
    expect(reloaded.selectedRowId).not.toBe(selectedRowId)
    expect(reloaded.servers.find(server => server.rowId === reloaded.selectedRowId)?.identifier).toBe('github')
  })

  it('keeps cwd when converting form rows into MCP config', () => {
    const server = stdioFormRow({
      command: ' npx ',
      argsText: '-y\n@modelcontextprotocol/server-filesystem',
      envEntries: [{ key: ' ROOT ', value: '/tmp' }],
      cwd: ' /Users/doji/dojiwork/airi ',
    })

    expect(buildServerConfig(server)).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: { ROOT: '/tmp' },
      cwd: '/Users/doji/dojiwork/airi',
    })

    expect(buildConfigFile([server], translateMessage)).toEqual({
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
          env: { ROOT: '/tmp' },
          cwd: '/Users/doji/dojiwork/airi',
        },
      },
    })
  })

  it('keeps the existing JSON draft when form rows are incomplete', () => {
    const previousDraft = '{\n  "mcpServers": {\n    "saved": { "command": "npx" }\n  }\n}\n'

    const result = syncJsonDraftFromServers(
      [stdioFormRow({ identifier: '', command: '' })],
      previousDraft,
      translateMessage,
      error => errorMessageFrom(error) ?? 'Unknown error',
    )

    expect(result.draft).toBe(previousDraft)
    expect(result.error).toBe('errors.empty-identifier:1')
  })

  it('rejects JSON drafts that violate the shared MCP schema', () => {
    expect(() => parseElectronMcpConfigText(JSON.stringify({
      mcpServers: {
        filesystem: {
          command: 'npx',
          env: [],
        },
      },
    }))).toThrow('mcpServers.filesystem.env: Invalid input: expected record, received array')
  })

  it('rejects unknown keys that the main process would reject too', () => {
    expect(() => parseElectronMcpConfigText(JSON.stringify({
      mcpServers: {
        filesystem: {
          command: 'npx',
          extraField: true,
        },
      },
    }))).toThrow('mcpServers.filesystem: Unrecognized key: "extraField"')
  })

  it('reports the closer of the two server shapes when neither one matches', () => {
    expect(() => parseElectronMcpConfigText(JSON.stringify({
      mcpServers: {
        remote: {
          url: 'https://mcp.example.com/mcp',
          cwd: '/tmp',
        },
      },
    }))).toThrow('mcpServers.remote: Unrecognized key: "cwd"')
  })

  it('converts a remote form row into an HTTP server config', () => {
    const server = stdioFormRow({
      identifier: 'remote',
      transport: 'http',
      command: 'still-here',
      url: ' https://mcp.example.com/mcp ',
      headerEntries: [{ key: ' Authorization ', value: 'Bearer token' }],
    })

    expect(buildServerConfig(server)).toEqual({
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('loads a remote server into a form row and saves it unchanged', () => {
    const config = parseElectronMcpConfigText(JSON.stringify({
      mcpServers: {
        remote: {
          url: 'https://mcp.example.com/mcp',
          headers: { Authorization: 'Bearer token' },
        },
      },
    }))

    const loaded = loadServerForms(config)
    expect(loaded.servers[0]?.transport).toBe('http')
    expect(loaded.servers[0]?.url).toBe('https://mcp.example.com/mcp')

    expect(buildConfigFile(loaded.servers, translateMessage)).toEqual(config)
  })

  it('reports a remote row that has no usable URL', () => {
    const empty = stdioFormRow({ identifier: 'remote', transport: 'http', url: '  ' })
    const wrongScheme = stdioFormRow({ identifier: 'remote', transport: 'http', url: 'file:///etc/passwd' })

    expect(validateServerForm(empty, translateMessage)).toBe('errors.empty-url:remote')
    expect(validateServerForm(wrongScheme, translateMessage)).toBe('errors.invalid-url:remote')
    expect(() => buildConfigFile([wrongScheme], translateMessage)).toThrow('errors.invalid-url:remote')
  })

  it('accepts a remote server entry in the shared schema', () => {
    const parsed = parseElectronMcpConfigText(JSON.stringify({
      mcpServers: {
        remote: {
          url: 'http://mcp.internal:8080/mcp',
          headers: { Authorization: 'Bearer token' },
        },
      },
    }))

    expect(parsed.mcpServers.remote).toEqual({
      url: 'http://mcp.internal:8080/mcp',
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('rejects a remote server entry whose URL is not HTTP', () => {
    expect(() => parseElectronMcpConfigText(JSON.stringify({
      mcpServers: {
        local: { url: 'file:///etc/passwd' },
      },
    }))).toThrow('must be an absolute http or https URL')
  })
})
