import type { MemoryEntry } from '../stores/memory'

import { describe, expect, it, vi } from 'vitest'

import { composeMemoryPrompt, createMemoryTools, FORGET_MEMORY_TOOL_NAME, READ_MEMORY_TOOL_NAME, WRITE_MEMORY_TOOL_NAME } from './memory'

const entry: MemoryEntry = { name: 'nickname', description: 'What the owner likes to be called.', body: 'Yumeka.', updatedAt: 0 }

function options() {
  return { read: vi.fn((name: string) => name === 'nickname' ? entry : undefined), write: vi.fn(() => entry), forget: vi.fn(() => true) }
}

describe('memory tools', () => {
  it('reads, writes, and forgets through the store bound to the run persona', async () => {
    const bound = options()
    const tools = await createMemoryTools(bound)
    const [read, write, forget] = tools
    const call = { messages: [], toolCallId: 'call' }

    expect(tools.map(tool => tool.function.name)).toEqual([READ_MEMORY_TOOL_NAME, WRITE_MEMORY_TOOL_NAME, FORGET_MEMORY_TOOL_NAME])
    expect(await read!.execute({ name: 'nickname' }, call)).toBe('nickname (general): Yumeka.')
    expect(await read!.execute({ name: 'unknown' }, call)).toBe('No memory entry with that name.')
    expect(await write!.execute({ name: 'nickname', description: 'd', body: 'Yumeka.', scope: 'general' }, call)).toBe('Saved memory "nickname".')
    expect(bound.write).toHaveBeenCalledWith({ name: 'nickname', description: 'd', body: 'Yumeka.', scope: 'general' })
    expect(await forget!.execute({ name: 'nickname' }, call)).toBe('Forgot memory "nickname".')
  })

  // Strict function calling rejects a schema whose objects leave a property out of `required`.
  it('declares every write property as required', async () => {
    const [, write] = await createMemoryTools(options())
    const parameters = write!.function.parameters as { required: string[], properties: Record<string, unknown>, additionalProperties: boolean }

    expect(parameters.required.sort()).toEqual(Object.keys(parameters.properties).sort())
    expect(parameters.additionalProperties).toBe(false)
  })

  it('asks for few, plain writes and shows the index', () => {
    expect(composeMemoryPrompt('General:\n- nickname: d')).toContain('Memory index:\nGeneral:\n- nickname: d')
    expect(composeMemoryPrompt('')).toContain('Most turns save nothing.')
    expect(composeMemoryPrompt('')).toContain('Never save what a recipe already holds')
    expect(composeMemoryPrompt('')).toContain('The memory index is empty.')
  })
})
