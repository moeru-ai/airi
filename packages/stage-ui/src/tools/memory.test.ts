import type { MemoryEntry } from '../stores/memory'

import { describe, expect, it, vi } from 'vitest'

import { composeMemoryPrompt, createMemoryTools, FORGET_MEMORY_TOOL_NAME, READ_MEMORY_TOOL_NAME, WRITE_MEMORY_TOOL_NAME } from './memory'

const entry: MemoryEntry = { name: 'nickname', description: 'What the owner likes to be called.', body: 'Yumeka.', updatedAt: 0 }

function options() {
  return {
    read: vi.fn((name: string) => name === 'nickname' ? entry : undefined),
    write: vi.fn((input: Pick<MemoryEntry, 'name' | 'description' | 'body'>): MemoryEntry => ({ ...input, updatedAt: 0 })),
    forget: vi.fn(() => true),
  }
}

describe('memory tools', () => {
  it('reads, writes, and forgets through the store bound to the run persona', async () => {
    const bound = options()
    const tools = await createMemoryTools(bound)
    const [read, write, forget] = tools
    const call = { messages: [], toolCallId: 'call' }

    expect(tools.map(tool => tool.function.name)).toEqual([READ_MEMORY_TOOL_NAME, WRITE_MEMORY_TOOL_NAME, FORGET_MEMORY_TOOL_NAME])
    // One call reads or writes every entry that the turn needs.
    expect(await read!.execute({ names: ['nickname', 'unknown'] }, call)).toBe('nickname (general): Yumeka.\nNo memory entry named "unknown".')
    expect(await write!.execute({ entries: [{ name: 'nickname', description: 'Yumeka.', body: 'Yumeka.' }, { name: 'city', description: 'Tokyo.', body: 'Tokyo.' }] }, call)).toBe('Saved memory "nickname".\nSaved memory "city".')
    expect(bound.write).toHaveBeenNthCalledWith(1, { name: 'nickname', description: 'Yumeka.', body: 'Yumeka.' })
    expect(bound.write).toHaveBeenNthCalledWith(2, { name: 'city', description: 'Tokyo.', body: 'Tokyo.' })
    expect(await forget!.execute({ name: 'nickname' }, call)).toBe('Forgot memory "nickname".')
  })

  // Strict function calling rejects a schema whose objects leave a property out of `required`.
  it('declares every write property as required, in each entry too', async () => {
    const [, write] = await createMemoryTools(options())
    const parameters = write!.function.parameters as { required: string[], properties: Record<string, unknown>, additionalProperties: boolean }
    const item = (parameters.properties.entries as { items: typeof parameters }).items

    expect(parameters.required.sort()).toEqual(Object.keys(parameters.properties).sort())
    expect(parameters.additionalProperties).toBe(false)
    expect(item.required.sort()).toEqual(Object.keys(item.properties).sort())
    expect(item.additionalProperties).toBe(false)
  })

  it('asks for few, plain writes and shows the index', () => {
    expect(composeMemoryPrompt('General:\n- nickname: d')).toContain('Memory index:\nGeneral:\n- nickname: d')
    expect(composeMemoryPrompt('')).toContain('An index line that already states the fact needs no read.')
    expect(composeMemoryPrompt('')).toContain('Most turns save nothing.')
    expect(composeMemoryPrompt('')).toContain('Never save what a recipe already holds')
    expect(composeMemoryPrompt('')).toContain('The memory index is empty.')
  })
})
