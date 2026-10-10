import { errorMessageFrom } from '@moeru/std'
import { describe, expect, it } from 'vitest'

import { parseElectronMcpConfigText } from '../../../../shared/mcp-config'
import {
  buildConfigFile,
  buildServerConfig,
  findServerIdentifierByRowId,
  loadServerForms,
  syncJsonDraftFromServers,
} from './mcp-config'

function translateMessage(key: string, params?: Record<string, unknown>) {
  if (params?.name)
    return `${key}:${String(params.name)}`

  if (params?.index)
    return `${key}:${String(params.index)}`

  return key
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
    const server = {
      rowId: 'mcp-static',
      identifier: 'filesystem',
      command: ' npx ',
      argsText: '-y\n@modelcontextprotocol/server-filesystem',
      envEntries: [{ key: ' ROOT ', value: '/tmp' }],
      cwd: ' /Users/doji/dojiwork/airi ',
      enabled: true,
    }

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
      [{
        rowId: 'pending',
        identifier: '',
        command: '',
        argsText: '',
        envEntries: [],
        cwd: '',
        enabled: true,
      }],
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
})
