import type { MemoryEntry } from '../stores/memory'

import { describe, expect, it, vi } from 'vitest'

import { composeMemoryPrompt, createMemoryTools, FORGET_MEMORY_TOOL_NAME, READ_MEMORY_TOOL_NAME, WRITE_MEMORY_TOOL_NAME } from './memory'

const entry: MemoryEntry = { name: 'nickname', description: 'What the owner likes to be called.', body: 'Yumeka.', visibility: 'shared', updatedAt: 0 }

function options(ownerOnly: boolean) {
  return { ownerOnly, read: vi.fn((name: string) => name === 'nickname' ? entry : undefined), write: vi.fn(() => entry), forget: vi.fn(() => true) }
}

describe('memory tools', () => {
  // A stranger in a scene cannot plant or erase a memory.
  it('gives a scene run only the reader, and the owner alone every tool', async () => {
    expect((await createMemoryTools(options(false))).map(tool => tool.function.name)).toEqual([READ_MEMORY_TOOL_NAME])
    expect((await createMemoryTools(options(true))).map(tool => tool.function.name)).toEqual([READ_MEMORY_TOOL_NAME, WRITE_MEMORY_TOOL_NAME, FORGET_MEMORY_TOOL_NAME])
  })

  it('reads, writes, and forgets through the bound store', async () => {
    const bound = options(true)
    const [read, write, forget] = await createMemoryTools(bound)
    const call = { messages: [], toolCallId: 'call' }

    expect(await read!.execute({ name: 'nickname' }, call)).toBe('nickname (shared): Yumeka.')
    expect(await read!.execute({ name: 'unknown' }, call)).toBe('No memory entry with that name.')
    expect(await write!.execute({ name: 'nickname', description: 'd', body: 'Yumeka.', visibility: 'shared' }, call)).toBe('Saved memory "nickname".')
    expect(bound.write).toHaveBeenCalledWith({ name: 'nickname', description: 'd', body: 'Yumeka.', visibility: 'shared' })
    expect(await forget!.execute({ name: 'nickname' }, call)).toBe('Forgot memory "nickname".')
  })

  // Strict function calling rejects a schema whose objects leave a property out of `required`.
  it('declares every write property as required', async () => {
    const [, write] = await createMemoryTools(options(true))
    const parameters = write!.function.parameters as { required: string[], properties: Record<string, unknown>, additionalProperties: boolean }

    expect(parameters.required.sort()).toEqual(Object.keys(parameters.properties).sort())
    expect(parameters.additionalProperties).toBe(false)
  })

  it('tells only the owner how to write, and shows the index', () => {
    expect(composeMemoryPrompt('- nickname: d', true)).toContain(WRITE_MEMORY_TOOL_NAME)
    expect(composeMemoryPrompt('- nickname: d', false)).not.toContain(WRITE_MEMORY_TOOL_NAME)
    expect(composeMemoryPrompt('- nickname: d', false)).toContain('Memory index:\n- nickname: d')
    expect(composeMemoryPrompt('', true)).toContain('The memory index is empty.')
  })
})
