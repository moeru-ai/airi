import type { ChatHistoryItem } from '../../types/chat'

import { afterEach, expect, it, vi } from 'vitest'

import { storage } from '../storage'
import { chatAudioRepo, mapChatAudio } from './chat-audio.repo'

afterEach(() => vi.restoreAllMocks())

it('keeps recorded bytes outside a synchronized history snapshot', async () => {
  const messages: ChatHistoryItem[] = [{
    role: 'user',
    id: crypto.randomUUID(),
    content: [{ type: 'input_audio', input_audio: { data: 'UklGRg==', format: 'wav' } }],
  }]
  const sessionId = crypto.randomUUID()
  const synchronized = await mapChatAudio(messages, data => chatAudioRepo.save(sessionId, data))

  expect(JSON.stringify(synchronized)).not.toContain('UklGRg==')
  expect(synchronized[0].content).toContainEqual({ type: 'input_audio', input_audio: { data: expect.stringMatching(/^airi-chat-audio:/), format: 'wav' } })
  expect(await mapChatAudio(synchronized, data => chatAudioRepo.load(data))).toEqual(messages)

  const anotherReference = await chatAudioRepo.save(sessionId, 'c2Vjb25k')
  await chatAudioRepo.removeSession(sessionId)
  await expect(chatAudioRepo.load(anotherReference)).rejects.toThrow('Stored chat audio is unavailable')
})

it('removes a saved blob when its index update fails', async () => {
  const sessionId = crypto.randomUUID()
  const setItemRaw = storage.setItemRaw.bind(storage)
  vi.spyOn(storage, 'setItemRaw').mockImplementation(async (key, value) => {
    if (key === `local:chat/audio-index/${sessionId}`)
      throw new Error('Storage quota exceeded')
    return await setItemRaw(key, value)
  })
  const removeItem = vi.spyOn(storage, 'removeItem')

  await expect(chatAudioRepo.save(sessionId, 'YXVkaW8=')).rejects.toThrow('Storage quota exceeded')

  const audioKey = removeItem.mock.calls.find(([key]) => key.startsWith(`local:chat/audio/${sessionId}/`))?.[0]
  if (!audioKey)
    throw new Error('Expected the failed audio write to be removed.')
  expect(await storage.getItemRaw(audioKey)).toBeNull()
})
