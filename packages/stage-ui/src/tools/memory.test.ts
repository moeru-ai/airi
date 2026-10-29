import type { MemoryEntry, MemoryWrite } from '../types/memory'

import { describe, expect, it, vi } from 'vitest'

import { composeMemoryPrompt, createMemoryTools, FORGET_MEMORY_TOOL_NAME, READ_MEMORY_TOOL_NAME, WRITE_MEMORY_TOOL_NAME } from './memory'

const entry: MemoryEntry = { id: 'nick', description: 'What the owner likes to be called.', body: 'Yumeka.', updatedAt: 0 }

function options() {
  return {
    read: vi.fn((id: string) => id === 'nick' ? entry : undefined),
    write: vi.fn(async (input: MemoryWrite): Promise<MemoryEntry> => ({ ...input, id: input.id ?? 'new', updatedAt: 0 })),
    forget: vi.fn(async () => true),
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
    expect(await read!.execute({ ids: ['nick', 'unknown'] }, call)).toBe('nick (general): Yumeka.\nNo memory entry with id "unknown".')
    // An id changes that entry. A null id adds a new one.
    expect(await write!.execute({ entries: [{ id: 'nick', description: 'Yumeka.', body: 'Yumeka.' }, { id: null, description: 'Tokyo.', body: 'Tokyo.' }] }, call)).toBe('Saved memory "nick".\nSaved memory "new".')
    expect(bound.write).toHaveBeenNthCalledWith(1, { id: 'nick', description: 'Yumeka.', body: 'Yumeka.' })
    expect(bound.write).toHaveBeenNthCalledWith(2, { id: undefined, description: 'Tokyo.', body: 'Tokyo.' })
    expect(await forget!.execute({ id: 'nick' }, call)).toBe('Forgot memory "nick".')
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

  it('saves on request, leaves other facts to the finalizer, and shows the index', () => {
    expect(composeMemoryPrompt('General:\n- nick: d')).toContain('Memory index:\nGeneral:\n- nick: d')
    expect(composeMemoryPrompt('')).toContain('An index line only helps you find an entry.')
    expect(composeMemoryPrompt('')).toContain('when someone asks you to remember something')
    expect(composeMemoryPrompt('')).toContain('Other lasting facts about the user are saved for you after each turn.')
    expect(composeMemoryPrompt('')).toContain('Never save what a recipe already holds')
    expect(composeMemoryPrompt('')).toContain('The memory index is empty.')
  })
})
