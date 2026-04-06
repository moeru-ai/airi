/**
 * Tool Search Registration Tests
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { describe, expect, it } from 'vitest'

import { registerToolSearch } from './register-tool-search'
import { initializeGlobalRegistry } from './tool-descriptors'

type ToolHandler = (input: Record<string, unknown>) => Promise<CallToolResult>

function createMockServer() {
  const handlers = new Map<string, ToolHandler>()

  return {
    server: {
      tool(...args: unknown[]) {
        const name = args[0] as string
        const handler = args.at(-1) as ToolHandler
        handlers.set(name, handler)
      },
    } as unknown as McpServer,
    async invoke(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(`Tool not registered: ${name}`)
      }

      return await handler(args)
    },
    getToolNames(): string[] {
      return Array.from(handlers.keys())
    },
  }
}

describe('registerToolSearch', () => {
  it('should register tool_search tool', () => {
    initializeGlobalRegistry()
    const { server, getToolNames } = createMockServer()

    registerToolSearch({ server })

    expect(getToolNames()).toContain('tool_search')
  })

  it('prioritizes exact canonical matches over other match types', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolSearch({ server })

    const result = await invoke('tool_search', {
      query: 'browser_cdp_status',
      limit: 5,
    })

    const structured = result.structuredContent as Record<string, any>
    const candidates = structured.candidates as Array<Record<string, any>>

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0]).toMatchObject({
      canonicalName: 'browser_cdp_status',
      matchBasis: 'canonical_exact',
    })
  })

  it('supports lane and kind filters', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolSearch({ server })

    const result = await invoke('tool_search', {
      query: 'status',
      lane: 'pty',
      kind: 'read',
    })

    const structured = result.structuredContent as Record<string, any>
    const candidates = structured.candidates as Array<Record<string, any>>

    expect(candidates.length).toBeGreaterThan(0)
    for (const candidate of candidates) {
      expect(candidate.lane).toBe('pty')
      expect(candidate.kind).toBe('read')
    }
  })

  it('applies limit truncation', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolSearch({ server })

    const result = await invoke('tool_search', {
      query: 'workflow',
      limit: 2,
    })

    const structured = result.structuredContent as Record<string, any>
    const candidates = structured.candidates as Array<Record<string, any>>

    expect(candidates).toHaveLength(2)
    expect(structured.returnedCount).toBe(2)
    expect(structured.totalCandidates).toBeGreaterThanOrEqual(2)
  })

  it('returns compact candidates without full descriptor schema', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolSearch({ server })

    const result = await invoke('tool_search', {
      query: 'screenshot',
      limit: 3,
    })

    expect(result.content).toBeDefined()
    expect(result.content[0]).toMatchObject({ type: 'text' })

    const structured = result.structuredContent as Record<string, any>
    const candidate = (structured.candidates as Array<Record<string, any>>)[0]

    expect(candidate).toBeDefined()
    expect(candidate).toHaveProperty('canonicalName')
    expect(candidate).toHaveProperty('summary')
    expect(candidate).toHaveProperty('matchBasis')
    expect(candidate).not.toHaveProperty('readOnly')
    expect(candidate).not.toHaveProperty('destructive')
  })

  it('returns empty candidates for non-matching query', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolSearch({ server })

    const result = await invoke('tool_search', {
      query: 'definitely-not-a-real-tool-keyword',
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.totalCandidates).toBe(0)
    expect(structured.returnedCount).toBe(0)
    expect((structured.candidates as unknown[]).length).toBe(0)
    expect((result.content[0] as { text: string }).text).toContain('No tools match')
  })
})
