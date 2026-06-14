import type { JsonSchema } from 'xsschema'

import type { McpToolDescriptor, McpToolRuntime } from './mcp'

import { describe, expect, it, vi } from 'vitest'

import { buildMcpNativeNames, createMcpMetaTools, mcp, normalizeOneLine, renderMcpCatalog, sanitizeMcpToolName } from './mcp'

describe('tools mcp schema', () => {
  it('emits strict parameter objects', async () => {
    const tools = await mcp()
    for (const name of ['builtIn_mcpListTools', 'builtIn_mcpCallTool']) {
      const t = tools.find(entry => entry.function.name === name)
      expect(t, `missing tool: ${name}`).toBeDefined()
      expect(t?.function.parameters.additionalProperties).toBe(false)
    }
  })

  it('builtIn_mcpCallTool uses flat name+arguments schema', async () => {
    const tools = await mcp()
    const callTool = tools.find(entry => entry.function.name === 'builtIn_mcpCallTool')
    expect(callTool).toBeDefined()

    const props = (callTool!.function.parameters as JsonSchema).properties!
    expect((props.name as JsonSchema).type).toBe('string')
    expect((props.arguments as JsonSchema).type).toBe('string')
  })
})

describe('builtIn_mcpCallTool execute', () => {
  async function getCallTool(runtime: McpToolRuntime, onToolInvoked?: (ref: string) => void) {
    const tools = await Promise.all(createMcpMetaTools(runtime, onToolInvoked))
    return tools.find(entry => entry.function.name === 'builtIn_mcpCallTool')!
  }

  const execOptions = { messages: [], toolCallId: 'call-1' }

  it('returns a structured isError result for malformed arguments JSON instead of throwing', async () => {
    const callTool = vi.fn()
    const tool = await getCallTool({ listTools: async () => [], callTool })

    const result = await tool.execute({ name: 'filesystem::read_file', arguments: '{not json' }, execOptions) as { isError?: boolean, content?: Array<{ text?: string }> }

    expect(result.isError).toBe(true)
    expect(result.content?.[0]?.text).toContain('Invalid JSON')
    // The malformed call must never reach the runtime.
    expect(callTool).not.toHaveBeenCalled()
  })

  it('promotes a tool only after a successful call', async () => {
    const onToolInvoked = vi.fn()
    const tool = await getCallTool(
      { listTools: async () => [], callTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }) },
      onToolInvoked,
    )

    await tool.execute({ name: 'filesystem::read_file', arguments: '{"path":"/tmp"}' }, execOptions)

    expect(onToolInvoked).toHaveBeenCalledWith('filesystem::read_file')
  })
})

describe('normalizeOneLine', () => {
  it('collapses a multi-line description to its first sentence', () => {
    expect(normalizeOneLine('Read a file.\nHandles encodings.\nExample: {}')).toBe('Read a file.')
  })

  it('flattens whitespace when there is no sentence terminator', () => {
    expect(normalizeOneLine('search   the\nweb')).toBe('search the web')
  })

  it('hard-caps an over-long single sentence with an ellipsis', () => {
    const out = normalizeOneLine(`${'x'.repeat(200)}.`)
    expect(out.length).toBe(120)
    expect(out.endsWith('…')).toBe(true)
  })

  it('returns empty for a missing/blank description', () => {
    expect(normalizeOneLine(undefined)).toBe('')
    expect(normalizeOneLine('   ')).toBe('')
  })
})

describe('sanitizeMcpToolName', () => {
  it('turns a "<server>::<tool>" ref into a prefixed, name-safe function name', () => {
    expect(sanitizeMcpToolName('filesystem::read_file')).toBe('mcp__filesystem__read_file')
  })

  it('replaces every invalid character and trims edge underscores', () => {
    expect(sanitizeMcpToolName('tavily::search/extract')).toBe('mcp__tavily__search_extract')
  })
})

describe('buildMcpNativeNames', () => {
  it('maps each ref to its sanitized name', () => {
    const map = buildMcpNativeNames(['filesystem::read_file', 'tavily::search'])
    expect(map.get('filesystem::read_file')).toBe('mcp__filesystem__read_file')
    expect(map.get('tavily::search')).toBe('mcp__tavily__search')
  })

  it('disambiguates two refs that sanitize to the same name', () => {
    // "a::b/c" and "a::b.c" both sanitize to mcp__a__b_c, so the second gets a numeric suffix.
    const map = buildMcpNativeNames(['a::b/c', 'a::b.c'])
    expect(map.get('a::b/c')).toBe('mcp__a__b_c')
    expect(map.get('a::b.c')).toBe('mcp__a__b_c_2')
    expect(new Set(map.values()).size).toBe(2)
  })
})

describe('renderMcpCatalog', () => {
  const descriptors: McpToolDescriptor[] = [
    { serverName: 'filesystem', toolName: 'read_file', name: 'filesystem::read_file', description: 'Read a file.\nMore.', inputSchema: {} },
    { serverName: 'tavily', toolName: 'search', name: 'tavily::search', description: 'Search the web.', inputSchema: {} },
  ]

  it('lists only the cold (not-yet-activated) tools, one normalized line each', () => {
    const out = renderMcpCatalog(descriptors, new Set(['tavily::search']))
    expect(out).toContain('- filesystem::read_file — Read a file.')
    expect(out).not.toContain('tavily::search')
  })

  it('returns empty when every tool is already activated', () => {
    expect(renderMcpCatalog(descriptors, new Set(['filesystem::read_file', 'tavily::search']))).toBe('')
  })
})
