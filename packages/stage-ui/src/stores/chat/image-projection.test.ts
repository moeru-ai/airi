import type { Conversation } from '@proj-airi/core-agent'

import { describe, expect, it, vi } from 'vitest'

import { describeChatImages } from './image-projection'

describe('chat image projection', () => {
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

  it('limits concurrent descriptions and preserves their source order', async () => {
    // ROOT CAUSE:
    //
    // The projection first awaited each image serially, then started every
    // image together without a limit. Serial work made latency additive, while
    // unbounded work could overload the vision provider on a long history.
    //
    // We fixed this with a four-permit semaphore. Promise.all still keeps the
    // projected content in the same order as the source content.
    let activeDescriptions = 0
    let maximumActiveDescriptions = 0
    const resolveByUrl = new Map<string, (description: string) => void>()
    const vision = vi.fn((url: string) => new Promise<string>((resolve) => {
      activeDescriptions += 1
      maximumActiveDescriptions = Math.max(maximumActiveDescriptions, activeDescriptions)
      resolveByUrl.set(url, (description) => {
        activeDescriptions -= 1
        resolve(description)
      })
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

    await vi.waitFor(() => expect(vision).toHaveBeenCalledTimes(4))
    expect(maximumActiveDescriptions).toBe(4)
    resolveImage('image-2')
    await vi.waitFor(() => expect(vision).toHaveBeenCalledTimes(5))
    resolveImage('image-0')
    await vi.waitFor(() => expect(vision).toHaveBeenCalledTimes(6))
    for (const url of ['image-1', 'image-3', 'image-4', 'image-5'])
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
    expect(maximumActiveDescriptions).toBe(4)
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
