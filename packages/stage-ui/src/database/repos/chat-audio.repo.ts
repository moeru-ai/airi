import type { ChatHistoryItem } from '../../types/chat'

import { nanoid } from 'nanoid'

import { storage } from '../storage'

const referencePrefix = 'airi-chat-audio:'
let indexQueue = Promise.resolve()

function indexKey(sessionId: string) {
  return `local:chat/audio-index/${sessionId}`
}

function enqueueIndex<T>(task: () => Promise<T>) {
  const next = indexQueue.then(task, task)
  indexQueue = next.then(() => undefined, () => undefined)
  return next
}

export function isChatAudioReference(data: string) {
  return data.startsWith(referencePrefix)
}

export function chatAudioReferences(messages: ChatHistoryItem[]) {
  const references = new Set<string>()
  for (const message of messages) {
    if (message.role !== 'user' || !Array.isArray(message.content))
      continue
    for (const part of message.content) {
      if (part.type === 'input_audio' && isChatAudioReference(part.input_audio.data))
        references.add(part.input_audio.data)
    }
  }
  return references
}

export const chatAudioRepo = {
  async save(sessionId: string, data: string) {
    if (isChatAudioReference(data))
      return data
    const reference = `${referencePrefix}${sessionId}/${nanoid()}`
    await storage.setItemRaw(`local:chat/audio/${reference.slice(referencePrefix.length)}`, data)
    await enqueueIndex(async () => {
      const references = await storage.getItemRaw<string[]>(indexKey(sessionId)) ?? []
      await storage.setItemRaw(indexKey(sessionId), [...references, reference])
    })
    return reference
  },

  async load(data: string) {
    if (!isChatAudioReference(data))
      return data

    const stored = await storage.getItemRaw<string>(`local:chat/audio/${data.slice(referencePrefix.length)}`)
    if (stored === null || stored === undefined)
      throw new Error('Stored chat audio is unavailable')
    return stored
  },

  async remove(sessionId: string, reference: string) {
    if (!isChatAudioReference(reference) || !reference.startsWith(`${referencePrefix}${sessionId}/`))
      return
    await enqueueIndex(async () => {
      const references = await storage.getItemRaw<string[]>(indexKey(sessionId)) ?? []
      if (!references.includes(reference))
        return
      await storage.removeItem(`local:chat/audio/${reference.slice(referencePrefix.length)}`)
      const remaining = references.filter(item => item !== reference)
      if (remaining.length)
        await storage.setItemRaw(indexKey(sessionId), remaining)
      else
        await storage.removeItem(indexKey(sessionId))
    })
  },

  async removeSession(sessionId: string) {
    await enqueueIndex(async () => {
      const references = await storage.getItemRaw<string[]>(indexKey(sessionId)) ?? []
      await Promise.all(references.map(reference => storage.removeItem(`local:chat/audio/${reference.slice(referencePrefix.length)}`)))
      await storage.removeItem(indexKey(sessionId))
    })
  },
}

export async function mapChatAudio(messages: ChatHistoryItem[], transform: (data: string) => Promise<string>): Promise<ChatHistoryItem[]> {
  return await Promise.all(messages.map(async (message) => {
    if (message.role !== 'user' || !Array.isArray(message.content))
      return message

    return {
      ...message,
      content: await Promise.all(message.content.map(async part => part.type === 'input_audio'
        ? { ...part, input_audio: { ...part.input_audio, data: await transform(part.input_audio.data) } }
        : part)),
    }
  }))
}
