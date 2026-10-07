import { defineInvokeHandler } from '@moeru/eventa'
import { afterEach, expect, it, vi } from 'vitest'

import { getSpeechBusContext, voiceSnapshotChanged, voiceSpeechCommand } from './bus'
import { SpeechClient } from './speech-client'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(stop => stop()))

it('closes a producer when the host rejects admission', async () => {
  cleanups.push(defineInvokeHandler(getSpeechBusContext(), voiceSpeechCommand, () => {
    throw new Error('Output unavailable')
  }))
  const speech = new SpeechClient({ sessionId: 'alice', turnId: 'failed' }, 'answer')
  await expect(speech.write('First')).rejects.toThrow('Output unavailable')
  expect(await speech.write('Late')).toEqual({ status: 'closed' })
})

it('cancels queued producer writes when the host disconnects during admission', async () => {
  const context = getSpeechBusContext()
  const admission = Promise.withResolvers<{ status: 'accepted' }>()
  const host = vi.fn(command => command.type === 'open' ? admission.promise : Promise.resolve({ status: 'accepted' as const }))
  cleanups.push(defineInvokeHandler(context, voiceSpeechCommand, host))
  const speech = new SpeechClient({ sessionId: 'alice', turnId: 'reply' }, 'answer')
  const write = speech.write('Late text')
  const rejected = expect(write).rejects.toThrow()
  await expect.poll(() => host.mock.calls.length).toBe(1)
  context.emit(voiceSnapshotChanged, { connected: false, drafts: [] })
  await rejected
  admission.resolve({ status: 'accepted' })
  await Promise.resolve()
  expect(host.mock.calls.some(([command]) => command.type === 'text')).toBe(false)
})

it('sends cancellation without waiting for admission and prevents queued text from following it', async () => {
  const context = getSpeechBusContext()
  const admission = Promise.withResolvers<{ status: 'accepted' }>()
  const commands: string[] = []
  cleanups.push(defineInvokeHandler(context, voiceSpeechCommand, (command) => {
    commands.push(command.type)
    return command.type === 'open' ? admission.promise : { status: 'accepted' }
  }))
  const speech = new SpeechClient({ sessionId: 'alice', turnId: 'reply' }, 'acknowledgment')
  const write = speech.write('Old acknowledgment').catch(() => ({ status: 'closed' }))
  await speech.cancel('Answer is ready')
  admission.resolve({ status: 'accepted' })
  expect(await write).toEqual({ status: 'closed' })
  expect(commands).toEqual(['open', 'cancel'])
})
