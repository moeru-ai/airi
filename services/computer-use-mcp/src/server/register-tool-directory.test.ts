/**
 * Tool Directory Registration Tests
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { describe, expect, it } from 'vitest'

import { registerToolDirectory } from './register-tool-directory'
import { initializeGlobalRegistry } from './tool-descriptors'

type ToolHandler = (input: Record<string, unknown>) => Promise<CallToolResult>

function createMockServer() {
  const handlers = new Map<string, ToolHandler>()
  const descriptions = new Map<string, string>()

  return {
    server: {
      tool(name: string, description: string, _schema: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
        descriptions.set(name, description)
      },
    } as McpServer,
    async invoke(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(`Tool not registered: ${name}`)
      }
      return handler(args)
    },
    getDescription(name: string): string | undefined {
      return descriptions.get(name)
    },
    getToolNames(): string[] {
      return Array.from(handlers.keys())
    },
  }
}

describe('registerToolDirectory', () => {
  it('should register tool_directory tool', () => {
    initializeGlobalRegistry()
    const { server, getToolNames } = createMockServer()

    registerToolDirectory({ server })

    expect(getToolNames()).toContain('tool_directory')
  })

  it('should return all tools without filters', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolDirectory({ server })

    const result = await invoke('tool_directory', {})

    expect(result.content).toBeDefined()
    expect(result.content.length).toBeGreaterThan(0)
    expect(result.structuredContent).toBeDefined()

    const structured = result.structuredContent as Record<string, unknown>
    expect(structured.status).toBe('ok')
    expect(structured.totalCount).toBeGreaterThan(50) // We have 60+ tools
    expect(Array.isArray(structured.tools)).toBe(true)
  })

  it('should filter by lane', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolDirectory({ server })

    const result = await invoke('tool_directory', { lane: 'coding' })
    const structured = result.structuredContent as Record<string, unknown>
    const tools = structured.tools as Array<{ lane: string }>

    expect(tools.length).toBeGreaterThan(0)
    for (const tool of tools) {
      expect(tool.lane).toBe('coding')
    }
  })

  it('should filter by kind', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolDirectory({ server })

    const result = await invoke('tool_directory', { kind: 'read' })
    const structured = result.structuredContent as Record<string, unknown>
    const tools = structured.tools as Array<{ kind: string }>

    expect(tools.length).toBeGreaterThan(0)
    for (const tool of tools) {
      expect(tool.kind).toBe('read')
    }
  })

  it('should filter readOnlyOnly', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolDirectory({ server })

    const result = await invoke('tool_directory', { readOnlyOnly: true })
    const structured = result.structuredContent as Record<string, unknown>
    const tools = structured.tools as Array<{ readOnly: boolean }>

    expect(tools.length).toBeGreaterThan(0)
    for (const tool of tools) {
      expect(tool.readOnly).toBe(true)
    }
  })

  it('should filter approvalRequiredOnly', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolDirectory({ server })

    const result = await invoke('tool_directory', { approvalRequiredOnly: true })
    const structured = result.structuredContent as Record<string, unknown>
    const tools = structured.tools as Array<{ requiresApprovalByDefault: boolean }>

    expect(tools.length).toBeGreaterThan(0)
    for (const tool of tools) {
      expect(tool.requiresApprovalByDefault).toBe(true)
    }
  })

  it('should filter by query', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolDirectory({ server })

    const result = await invoke('tool_directory', { query: 'screenshot' })
    const structured = result.structuredContent as Record<string, unknown>
    const tools = structured.tools as Array<{ canonicalName: string, displayName: string, summary: string }>

    expect(tools.length).toBeGreaterThan(0)
    for (const tool of tools) {
      const searchable = `${tool.canonicalName} ${tool.displayName} ${tool.summary}`.toLowerCase()
      expect(searchable).toContain('screenshot')
    }
  })

  it('should combine multiple filters', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolDirectory({ server })

    const result = await invoke('tool_directory', {
      lane: 'coding',
      readOnlyOnly: true,
    })
    const structured = result.structuredContent as Record<string, unknown>
    const tools = structured.tools as Array<{ lane: string, readOnly: boolean }>

    expect(tools.length).toBeGreaterThan(0)
    for (const tool of tools) {
      expect(tool.lane).toBe('coding')
      expect(tool.readOnly).toBe(true)
    }
  })

  it('should return compact text content', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolDirectory({ server })

    const result = await invoke('tool_directory', { lane: 'accessibility' })

    expect(result.content).toBeDefined()
    expect(result.content.length).toBe(1)

    const textContent = result.content[0]
    expect(textContent.type).toBe('text')
    expect((textContent as { text: string }).text).toContain('accessibility_snapshot')
    expect((textContent as { text: string }).text).toContain('|')
  })

  it('should return empty result for no matches', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolDirectory({ server })

    const result = await invoke('tool_directory', { query: 'xyznonexistent123' })
    const structured = result.structuredContent as Record<string, unknown>

    expect(structured.totalCount).toBe(0)
    expect((structured.tools as unknown[]).length).toBe(0)
    expect((result.content[0] as { text: string }).text).toContain('No tools match')
  })

  it('should include filter info in structured content', async () => {
    initializeGlobalRegistry()
    const { server, invoke } = createMockServer()
    registerToolDirectory({ server })

    const result = await invoke('tool_directory', {
      lane: 'coding',
      kind: 'read',
      readOnlyOnly: true,
      query: 'file',
    })
    const structured = result.structuredContent as Record<string, unknown>
    const filters = structured.filters as Record<string, unknown>

    expect(filters.lane).toBe('coding')
    expect(filters.kind).toBe('read')
    expect(filters.readOnlyOnly).toBe(true)
    expect(filters.query).toBe('file')
  })
})
