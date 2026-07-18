import type { Tool } from '@xsai/shared-chat'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLlmToolsStore } from './llm-tools'

describe('useLlmToolsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('registers and merges tools by provider', () => {
    const store = useLlmToolsStore()
    const mcpTool = { function: { name: 'builtIn_mcpListTools' } } as Tool
    const pluginTool = { function: { name: 'play_chess' } } as Tool

    store.registerTools('mcp', [mcpTool])
    store.registerTools('plugin-tools', [pluginTool])

    expect(store.toolsByProvider).toEqual({
      'mcp': [mcpTool],
      'plugin-tools': [pluginTool],
    })
    expect(store.activeTools).toEqual([mcpTool, pluginTool])
  })

  it('replaces tools for the same provider instead of appending forever', () => {
    const store = useLlmToolsStore()
    const first = { function: { name: 'first' } } as Tool
    const second = { function: { name: 'second' } } as Tool

    store.registerTools('plugin-tools', [first])
    store.registerTools('plugin-tools', [second])

    expect(store.toolsByProvider).toEqual({
      'plugin-tools': [second],
    })
    expect(store.activeTools).toEqual([second])
  })

  it('clears one provider without touching the others', () => {
    const store = useLlmToolsStore()
    const mcpTool = { function: { name: 'builtIn_mcpListTools' } } as Tool
    const pluginTool = { function: { name: 'play_chess' } } as Tool

    store.registerTools('mcp', [mcpTool])
    store.registerTools('plugin-tools', [pluginTool])
    store.clearTools('plugin-tools')

    expect(store.toolsByProvider).toEqual({
      mcp: [mcpTool],
    })
    expect(store.activeTools).toEqual([mcpTool])
  })

  it('does not change store state when the caller mutates the registered array later', () => {
    const store = useLlmToolsStore()
    const first = { function: { name: 'first' } } as Tool
    const second = { function: { name: 'second' } } as Tool
    const tools = [first]

    store.registerTools('plugin-tools', tools)
    tools.push(second)

    expect(store.toolsByProvider).toEqual({
      'plugin-tools': [first],
    })
    expect(store.activeTools).toEqual([first])
  })

  /**
   * @example
   * store.registerTools('plugin-tools', Promise.resolve([pluginTool]))
   * await store.awaitPendingRegistrations()
   */
  it('waits for async tool registrations before exposing them as active tools', async () => {
    const store = useLlmToolsStore()
    const pluginTool = { function: { name: 'play_chess' } } as Tool
    let resolveTools: ((tools: Tool[]) => void) | undefined
    const pendingTools = new Promise<Tool[]>((resolve) => {
      resolveTools = resolve
    })
    const onSettled = vi.fn()

    store.registerTools('plugin-tools', pendingTools)
    const pendingWait = store.awaitPendingRegistrations().then(() => {
      onSettled()
    })

    await Promise.resolve()

    expect(store.toolsByProvider['plugin-tools']).toBeUndefined()
    expect(store.activeTools).toEqual([])
    expect(onSettled).not.toHaveBeenCalled()

    resolveTools?.([pluginTool])
    await pendingWait

    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(store.toolsByProvider['plugin-tools']).toEqual([pluginTool])
    expect(store.activeTools).toEqual([pluginTool])
  })

  /**
   * @example
   * store.registerTools('plugin-tools', slowTools)
   * store.registerTools('plugin-tools', [latestTool])
   */
  it('ignores stale async registrations after newer tools replace the same provider', async () => {
    const store = useLlmToolsStore()
    const staleTool = { function: { name: 'stale' } } as Tool
    const latestTool = { function: { name: 'latest' } } as Tool
    let resolveTools: ((tools: Tool[]) => void) | undefined
    const pendingTools = new Promise<Tool[]>((resolve) => {
      resolveTools = resolve
    })

    store.registerTools('plugin-tools', pendingTools)
    store.registerTools('plugin-tools', [latestTool])
    resolveTools?.([staleTool])

    await store.awaitPendingRegistrations()

    expect(store.toolsByProvider['plugin-tools']).toEqual([latestTool])
    expect(store.activeTools).toEqual([latestTool])
  })
})
