import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { fileSource } from '@proj-airi/audio/encoding'
import { AudioInput, createPushStream } from '@proj-airi/pipelines-audio'
import { expect, it, vi } from 'vitest'

import { VoiceMessage } from './voice-message'

it('retains an explicitly sent preview after failure and retries with the same session and message identity', async () => {
  const source = createPushStream<PcmBlock>()
  const submit = vi.fn<(draft: { messageId: string, sessionId: string, audio: Blob }) => Promise<{ messageId: string }>>()
  const message = new VoiceMessage('message-1', 'alice', new AudioInput({ live: true, open: () => source.stream }), submit)
  source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 1600 }, sampleRate: 16000, channels: [new Float32Array(1600).fill(0.25)] })
  await expect.poll(() => message.snapshot.phase).toBe('capturing')
  await message.finish()
  await expect.poll(() => message.snapshot.phase).toBe('ready')
  expect(submit).not.toHaveBeenCalled()
  submit.mockRejectedValueOnce(new Error('Persistence failed'))
  await expect(message.send()).rejects.toThrow('Persistence failed')
  expect(message.snapshot.phase).toBe('ready')
  let recorded = 0
  for await (const block of fileSource(message.snapshot.audio!).open(new AbortController().signal))
    recorded += block.channels[0].length
  expect(recorded).toBe(1600)
  const persisted = Promise.withResolvers<{ messageId: string }>()
  submit.mockReturnValueOnce(persisted.promise)
  const first = message.send()
  expect(message.send()).toBe(first)
  expect(message.cancel()).toBe('closed')
  persisted.resolve({ messageId: 'message-1' })
  await first
  await message.send()
  expect(submit).toHaveBeenCalledTimes(2)
  expect(submit.mock.calls.map(([draft]) => [draft.messageId, draft.sessionId])).toEqual([['message-1', 'alice'], ['message-1', 'alice']])
  expect(message.snapshot.phase).toBe('sent')
})

it('cancels a recording that is still waiting for audio without submitting or creating a preview', async () => {
  const released = vi.fn()
  const submit = vi.fn()
  const message = new VoiceMessage('pending', 'bob', new AudioInput({ live: true, open: (signal) => {
    signal.addEventListener('abort', released)
    return createPushStream<PcmBlock>().stream
  } }), submit)
  expect(message.snapshot.phase).toBe('pending')
  message.cancel()
  expect(message.snapshot.phase).toBe('cancelled')
  expect(message.snapshot.audio).toBeUndefined()
  await expect(message.send()).rejects.toThrow('not ready')
  expect(submit).not.toHaveBeenCalled()
  await expect.poll(() => released.mock.calls.length).toBe(1)
})
