// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { parseElectronMcpConfigText } from '../../../../shared/mcp-config'
import { buildConfigFile, buildServerConfig, createServerForm, loadServerForms } from './mcp-config'

describe('mcp settings UI ships a working Serena config surface', () => {
  it('a blank createServerForm is a valid seed row for a preset', () => {
    const server = createServerForm()

    expect(server.rowId).toMatch(/^mcp-/)
    expect(server.identifier).toBe('')
    expect(server.enabled).toBe(true)
    expect(server.envEntries).toEqual([])
  })

  it('round-trips a hand-filled Serena form through buildConfigFile with uvx context ide-assistant', () => {
    const server = createServerForm()
    server.identifier = 'serena'
    server.command = ' uvx '
    server.argsText = [
      '--from',
      'git+https://github.com/oraios/serena',
      'serena',
      'start-mcp-server',
      '--context',
      'ide-assistant',
    ].join('\n')

    const config = buildConfigFile([server], (key, params) => (params?.name ? `${key}:${String(params.name)}` : key))

    expect(config.mcpServers.serena).toEqual({
      command: 'uvx',
      args: [
        '--from',
        'git+https://github.com/oraios/serena',
        'serena',
        'start-mcp-server',
        '--context',
        'ide-assistant',
      ],
    })

    expect(buildServerConfig(server)).toEqual(config.mcpServers.serena)
  })

  it('loads a persisted Serena config back into editable form rows', () => {
    const parsed = parseElectronMcpConfigText(
      JSON.stringify({
        mcpServers: {
          serena: {
            command: 'uvx',
            args: [
              '--from',
              'git+https://github.com/oraios/serena',
              'serena',
              'start-mcp-server',
              '--context',
              'ide-assistant',
            ],
          },
        },
      }),
    )

    const loaded = loadServerForms(parsed)
    expect(loaded.servers).toHaveLength(1)

    const row = loaded.servers[0]!
    expect(row.identifier).toBe('serena')
    expect(row.command).toBe('uvx')
    expect(row.argsText).toContain('git+https://github.com/oraios/serena')
    expect(row.argsText).toContain('start-mcp-server')
  })
})
