import type { AudioInput, PcmBlock } from '@proj-airi/pipelines-audio'

import { createPushStream, AudioInput as Input, Recording } from '@proj-airi/pipelines-audio'
import { expect, it, vi } from 'vitest'

import { VoiceMessage } from './voice-message'

it('retains an explicitly sent preview after failure and retries with the same session and message identity', async () => {
  const source = createPushStream<PcmBlock>()
  const input = new Input({ id: 'microphone', frames: source.stream, close: async () => {} }, {
    supportsFile: () => true,
    encode: async (frames) => {
      for await (const _block of frames) { /* Consume the external audio source. */ }
      return new Blob(['recorded samples'], { type: 'audio/wav' })
    },
  })
  const submit = vi.fn<(draft: { messageId: string, sessionId: string, audio: Blob }) => Promise<{ messageId: string }>>()
  const recording = new Recording(async () => input, { mimeType: 'audio/wav', sampleRate: 16000, channels: 1 })
  const message = new VoiceMessage('message-1', 'alice', recording, submit)
  await expect.poll(() => message.snapshot.phase).toBe('capturing')
  await message.finish()
  expect(message.snapshot.phase).toBe('ready')
  expect(submit).not.toHaveBeenCalled()
  submit.mockRejectedValueOnce(new Error('Persistence failed'))
  await expect(message.send()).rejects.toThrow('Persistence failed')
  expect(message.snapshot.phase).toBe('ready')
  expect(await message.snapshot.audio!.text()).toBe('recorded samples')
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
  await input.close()
})

it('cancels pending permission without submitting or creating a preview', async () => {
  const permission = Promise.withResolvers<AudioInput>()
  const submit = vi.fn()
  const message = new VoiceMessage('pending', 'bob', new Recording(() => permission.promise, { mimeType: 'audio/wav', sampleRate: 16000, channels: 1 }), submit)
  expect(message.snapshot.phase).toBe('pending')
  message.cancel()
  expect(message.snapshot.phase).toBe('cancelled')
  expect(message.snapshot.audio).toBeUndefined()
  await expect(message.send()).rejects.toThrow('not ready')
  expect(submit).not.toHaveBeenCalled()
})
