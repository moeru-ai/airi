import type { ChatHistoryItem } from '../../types/chat'

import { expect, it } from 'vitest'

import { chatAudioRepo, mapChatAudio } from './chat-audio.repo'

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
