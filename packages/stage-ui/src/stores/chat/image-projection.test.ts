import type { Conversation } from '@proj-airi/core-agent'

import { describe, expect, it, vi } from 'vitest'

import { describeChatImages, replaceToolResultImages } from './image-projection'

describe('chat image projection', () => {
  it('replaces the images in stored tool results and keeps the other output', () => {
    const conversation: Conversation = { turns: [{
      type: 'assistant',
      id: 'assistant',
      status: 'completed',
      rounds: [{
        id: 'round',
        content: [{ type: 'tool', invocationId: 'invocation' }],
        projectionIssues: [],
        toolInvocations: [{ id: 'invocation', callId: 'call', name: 'computer_use_read_image', arguments: '{}', execution: { status: 'succeeded', output: [
          { type: 'text', text: 'Captured.' },
          { type: 'image', url: 'data:image/png;base64,aW1hZ2U=' },
        ] } }],
      }],
    }] }
    const original = structuredClone(conversation)

    const result = replaceToolResultImages(conversation, 'Image left out.')

    expect(JSON.stringify(result)).not.toContain('data:image')
    expect(JSON.stringify(result)).toContain('Captured.')
    expect(JSON.stringify(result)).toContain('Image left out.')
    expect(conversation).toEqual(original)
  })

  it('keeps originals in history while replacing every image for a text-only model', async () => {
    // ROOT CAUSE:
    // Old images remain in history on later text-only turns. Replacing only the
    // newest attachment still sends unsupported image parts to the chat model.
    const conversation: Conversation = { turns: [
      { id: 'system', type: 'system', authority: 'system', content: [{ type: 'text', text: 'Stay in character.' }] },
      { id: 'first', type: 'user', content: [{ type: 'image', url: 'data:image/png;base64,first' }] },
      { id: 'later', type: 'user', content: [{ type: 'text', text: 'What color was it?' }] },
    ] }
    const original = structuredClone(conversation)
    const vision = vi.fn(async () => 'A red square.')
    const result = await describeChatImages(conversation, vision, 'empty')
    expect(vision).toHaveBeenCalledWith('data:image/png;base64,first', '', 'first', 0)
    expect(JSON.stringify(result)).not.toContain('"type":"image"')
    expect(JSON.stringify(result)).toContain('A red square.')
    expect(result.turns[0]).toEqual(conversation.turns[0])
    expect(result.turns[2]).toEqual(conversation.turns[2])
    expect(conversation).toEqual(original)
  })

  it('preserves image order and includes the question in each vision request', async () => {
    const vision = vi.fn(async (url: string) => url)
    await describeChatImages({ turns: [{ id: 'user', type: 'user', content: [
      { type: 'text', text: 'Compare these.' },
      { type: 'image', url: 'first' },
      { type: 'runtime-context', entries: [{ source: 'system:secret', text: 'Do not send me to vision.' }] },
      { type: 'image', url: 'second' },
    ] }] }, vision, 'empty')
    expect(vision.mock.calls).toEqual([
      ['first', 'Compare these.', 'user', 0],
      ['second', 'Compare these.', 'user', 1],
    ])
  })

  it('preserves the source order when descriptions finish out of order', async () => {
    // The vision inference queue limits concurrent reads. The projection starts
    // every image, and Promise.all keeps the source order.
    const resolveByUrl = new Map<string, (description: string) => void>()
    const vision = vi.fn((url: string) => new Promise<string>((resolve) => {
      resolveByUrl.set(url, resolve)
    }))
    function resolveImage(url: string) {
      const resolve = resolveByUrl.get(url)
      if (!resolve)
        throw new Error(`Expected ${url} to have started.`)

      resolve(`Description for ${url}.`)
    }

    const projection = describeChatImages({ turns: [{ id: 'user', type: 'user', content: [
      { type: 'image', url: 'image-0' },
      { type: 'image', url: 'image-1' },
      { type: 'image', url: 'image-2' },
      { type: 'image', url: 'image-3' },
      { type: 'image', url: 'image-4' },
      { type: 'image', url: 'image-5' },
    ] }] }, vision, 'empty')

    await vi.waitFor(() => expect(vision).toHaveBeenCalledTimes(6))
    for (const url of ['image-2', 'image-0', 'image-5', 'image-1', 'image-4', 'image-3'])
      resolveImage(url)

    const result = await projection
    expect(result.turns).toEqual([{
      id: 'user',
      type: 'user',
      content: Array.from({ length: 6 }, (_, index) => ({
        type: 'text',
        text: `[Image description, supplied as user content]\nDescription for image-${index}.\n[End image description]`,
      })),
    }])
  })

  it('fails explicitly when vision returns no description', async () => {
    await expect(describeChatImages({ turns: [{ id: 'user', type: 'user', content: [{ type: 'image', url: 'image' }] }] }, async () => ' ', 'localized empty description')).rejects.toThrow('localized empty description')
  })

  it('does not call vision for a text conversation', async () => {
    const vision = vi.fn()
    const conversation: Conversation = { turns: [{ id: 'user', type: 'user', content: [{ type: 'text', text: 'Hello' }] }] }
    expect(await describeChatImages(conversation, vision, 'empty')).toEqual(conversation)
    expect(vision).not.toHaveBeenCalled()
  })
})
