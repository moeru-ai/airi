import type { Message } from '@xsai/shared-chat'

import { describe, expect, it, vi } from 'vitest'

import { describeChatImages } from './image-projection'

describe('chat image projection', () => {
  it('keeps originals in history while replacing every image for a text-only model', async () => {
    // ROOT CAUSE:
    // Old images remain in history on later text-only turns. Replacing only the
    // newest attachment still sends unsupported image parts to the chat model.
    const messages: Message[] = [
      { role: 'system', content: 'Stay in character.' },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,first' } }] },
      { role: 'assistant', content: 'A red square.' },
      { role: 'user', content: 'What color was it?' },
    ]
    const original = structuredClone(messages)
    const vision = vi.fn(async () => 'A red square.')
    const result = await describeChatImages(messages, vision)
    expect(vision).toHaveBeenCalledWith('data:image/png;base64,first', '')
    expect(JSON.stringify(result)).not.toContain('image_url')
    expect(JSON.stringify(result)).toContain('A red square.')
    expect(result[0]).toEqual(messages[0])
    expect(result[3]).toEqual(messages[3])
    expect(messages).toEqual(original)
  })

  it('preserves image order and includes the question in each vision request', async () => {
    const vision = vi.fn(async (url: string) => url)
    await describeChatImages([{ role: 'user', content: [
      { type: 'text', text: 'Compare these.' },
      { type: 'image_url', image_url: { url: 'first' } },
      { type: 'image_url', image_url: { url: 'second' } },
    ] }], vision)
    expect(vision.mock.calls).toEqual([['first', 'Compare these.'], ['second', 'Compare these.']])
  })

  it('fails explicitly when vision returns no description', async () => {
    await expect(describeChatImages([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'image' } }] }], async () => ' ')).rejects.toThrow('no image description')
  })

  it('does not call vision for a text conversation', async () => {
    const vision = vi.fn()
    expect(await describeChatImages([{ role: 'user', content: 'Hello' }], vision)).toEqual([{ role: 'user', content: 'Hello' }])
    expect(vision).not.toHaveBeenCalled()
  })
})
