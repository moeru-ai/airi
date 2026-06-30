import { describe, expect, it } from 'vitest'

import {
  callReadOnlyMcpTool,
  createCodeIntelligenceFacade,
  type CodeIntelligenceTransport,
  type LocalSearchInput,
  type LocalSearchResult,
  type McpToolCall,
  type McpToolResult,
  type McpToolSummary,
} from './index'

const serenaTools: McpToolSummary[] = [
  { serverName: 'serena', name: 'serena::get_symbols_overview', toolName: 'get_symbols_overview' },
  { serverName: 'serena', name: 'serena::find_symbol', toolName: 'find_symbol' },
  { serverName: 'serena', name: 'serena::find_declaration', toolName: 'find_declaration' },
  { serverName: 'serena', name: 'serena::find_referencing_symbols', toolName: 'find_referencing_symbols' },
  { serverName: 'serena', name: 'serena::get_diagnostics_for_file', toolName: 'get_diagnostics_for_file' },
  { serverName: 'serena', name: 'serena::search_for_pattern', toolName: 'search_for_pattern' },
]

function createTransport(
  tools: McpToolSummary[],
  results: Record<string, McpToolResult> = {},
  localResults: LocalSearchResult[] = [],
) {
  const calls: McpToolCall[] = []
  const searches: LocalSearchInput[] = []

  const transport: CodeIntelligenceTransport = {
    async listMcpTools() {
      return tools
    },
    async callMcpTool(input) {
      calls.push(input)
      return results[input.toolName ?? input.name] ?? { toolResult: { called: input } }
    },
    async searchFiles(input) {
      searches.push(input)
      return localResults
    },
  }

  return { calls, searches, transport }
}

describe('code intelligence facade', () => {
  it('selects Serena read-only tools before generic MCP tools', async () => {
    const genericFindSymbol = {
      serverName: 'generic',
      name: 'generic::workspace_find_symbol',
      toolName: 'workspace_find_symbol',
    }
    const { calls, transport } = createTransport([genericFindSymbol, ...serenaTools], {
      find_symbol: { structuredContent: { symbols: ['AiriRuntime'] } },
    })

    const facade = createCodeIntelligenceFacade(transport)
    const result = await facade.workspace_find_symbol({
      query: 'AiriRuntime',
      relativePath: 'src/runtime.ts',
      includeBody: true,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      serverName: 'serena',
      name: 'serena::find_symbol',
      toolName: 'find_symbol',
      arguments: {
        include_body: true,
        name_path: 'AiriRuntime',
        relative_path: 'src/runtime.ts',
      },
    })
    expect(result).toEqual({
      backend: 'serena',
      serverName: 'serena',
      toolName: 'find_symbol',
      query: {
        includeBody: true,
        query: 'AiriRuntime',
        relativePath: 'src/runtime.ts',
      },
      rawResult: { structuredContent: { symbols: ['AiriRuntime'] } },
    })
  })

  it('falls back to generic MCP tools when Serena is unavailable', async () => {
    const { calls, transport } = createTransport(
      [
        {
          serverName: 'generic-code',
          name: 'generic-code::workspace_search_pattern',
          toolName: 'workspace_search_pattern',
        },
      ],
      {
        workspace_search_pattern: { toolResult: [{ filePath: 'src/a.ts', line: 12 }] },
      },
    )

    const facade = createCodeIntelligenceFacade(transport)
    const result = await facade.workspace_search_pattern({ query: 'needle', limit: 5 })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      serverName: 'generic-code',
      name: 'generic-code::workspace_search_pattern',
      toolName: 'workspace_search_pattern',
      arguments: {
        limit: 5,
        query: 'needle',
      },
    })
    expect(result.backend).toBe('available')
    expect(result.serverName).toBe('generic-code')
    expect(result.toolName).toBe('workspace_search_pattern')
    expect(result.rawResult).toEqual({ toolResult: [{ filePath: 'src/a.ts', line: 12 }] })
  })

  it('falls back to local search when no suitable MCP tool exists', async () => {
    const { calls, searches, transport } = createTransport([], {}, [
      { filePath: 'src/a.ts', line: 7, text: 'const needle = true' },
    ])

    const facade = createCodeIntelligenceFacade(transport)
    const result = await facade.workspace_search_pattern({
      query: 'needle',
      rootPath: '/workspace',
      limit: 3,
    })

    expect(calls).toHaveLength(0)
    expect(searches).toEqual([{ query: 'needle', rootPath: '/workspace', limit: 3 }])
    expect(result).toEqual({
      backend: 'unavailable',
      serverName: undefined,
      toolName: 'local_search',
      query: {
        limit: 3,
        query: 'needle',
        rootPath: '/workspace',
      },
      rawResult: [{ filePath: 'src/a.ts', line: 7, text: 'const needle = true' }],
    })
  })

  it('records provenance for declaration and reference lookups', async () => {
    const { transport } = createTransport(serenaTools, {
      find_declaration: { structuredContent: { filePath: 'src/a.ts', line: 3 } },
      find_referencing_symbols: { structuredContent: { references: ['src/b.ts:10'] } },
    })

    const facade = createCodeIntelligenceFacade(transport)
    const declaration = await facade.workspace_find_declaration({ query: 'createRuntime' })
    const references = await facade.workspace_find_references({ query: 'createRuntime' })

    expect(declaration).toMatchObject({
      backend: 'serena',
      serverName: 'serena',
      toolName: 'find_declaration',
      query: { query: 'createRuntime' },
      rawResult: { structuredContent: { filePath: 'src/a.ts', line: 3 } },
    })
    expect(references).toMatchObject({
      backend: 'serena',
      serverName: 'serena',
      toolName: 'find_referencing_symbols',
      query: { query: 'createRuntime' },
      rawResult: { structuredContent: { references: ['src/b.ts:10'] } },
    })
  })

  it('rejects mutating Serena tools instead of proxying them', async () => {
    const { calls, transport } = createTransport([
      { serverName: 'serena', name: 'serena::rename_symbol', toolName: 'rename_symbol' },
    ])

    await expect(
      callReadOnlyMcpTool(
        transport,
        { serverName: 'serena', name: 'serena::rename_symbol', toolName: 'rename_symbol' },
        { namePath: 'OldName', newName: 'NewName' },
      ),
    ).rejects.toThrow(/mutating Serena tool/i)
    expect(calls).toHaveLength(0)
  })

  it('aggregates ranked context from available code intelligence sources', async () => {
    const { calls, transport } = createTransport(serenaTools, {
      find_symbol: { structuredContent: { symbols: ['AiriRuntime'] } },
      search_for_pattern: { structuredContent: { matches: ['src/runtime.ts:20'] } },
    })

    const facade = createCodeIntelligenceFacade(transport)
    const result = await facade.workspace_ranked_context({
      query: 'AiriRuntime',
      relativePath: 'src/runtime.ts',
      limit: 4,
    })

    expect(calls.map((call) => call.toolName)).toEqual(['find_symbol', 'search_for_pattern'])
    expect(result).toEqual({
      backend: 'serena',
      serverName: 'serena',
      toolName: 'workspace_ranked_context',
      query: {
        limit: 4,
        query: 'AiriRuntime',
        relativePath: 'src/runtime.ts',
      },
      rawResult: {
        items: [
          {
            kind: 'symbol',
            result: {
              backend: 'serena',
              serverName: 'serena',
              toolName: 'find_symbol',
              query: {
                includeBody: true,
                limit: 4,
                query: 'AiriRuntime',
                relativePath: 'src/runtime.ts',
              },
              rawResult: { structuredContent: { symbols: ['AiriRuntime'] } },
            },
          },
          {
            kind: 'pattern',
            result: {
              backend: 'serena',
              serverName: 'serena',
              toolName: 'search_for_pattern',
              query: {
                limit: 4,
                query: 'AiriRuntime',
                relativePath: 'src/runtime.ts',
              },
              rawResult: { structuredContent: { matches: ['src/runtime.ts:20'] } },
            },
          },
        ],
      },
    })
  })
})
