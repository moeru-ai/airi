import type { HermesReplyResponse } from '@proj-airi/server-sdk-shared'

import type { ContextMessage } from '../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { StorageSerializers, useLocalStorage } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'

interface HermesSessionMemoryRecord {
  sessionId: string
  summary: string
  facts: string[]
  lastRoute: HermesReplyResponse['route'] | null
  lastSceneType: HermesReplyResponse['sceneType'] | null
  judgeScore: HermesReplyResponse['judge']['score']
  judgeFlags: string[]
  updatedAt: number
}

function dedupeFacts(facts: string[]) {
  return Array.from(new Set(facts.map(item => item.trim()).filter(Boolean)))
}

export const useHermesMemoryStore = defineStore('chat-hermes-memory', () => {
  const records = useLocalStorage<Record<string, HermesSessionMemoryRecord>>('chat/v1/hermes-memory', {}, {
    serializer: StorageSerializers.object,
  })

  function getSessionMemory(sessionId: string) {
    return records.value[sessionId]
  }

  function applyResponse(sessionId: string, response: HermesReplyResponse) {
    const current = records.value[sessionId] ?? {
      sessionId,
      summary: '',
      facts: [],
      lastRoute: null,
      lastSceneType: null,
      judgeScore: null,
      judgeFlags: [],
      updatedAt: 0,
    }

    const summary = response.memoryUpdates.summaryAppend?.trim()
      ? [current.summary, response.memoryUpdates.summaryAppend.trim()].filter(Boolean).join('\n')
      : current.summary

    const facts = dedupeFacts([
      ...current.facts.filter(fact => !response.memoryUpdates.factsRemove.includes(fact)),
      ...response.memoryUpdates.factsAdd,
    ])

    records.value = {
      ...records.value,
      [sessionId]: {
        sessionId,
        summary,
        facts,
        lastRoute: response.route,
        lastSceneType: response.sceneType ?? null,
        judgeScore: response.judge.score ?? null,
        judgeFlags: dedupeFacts(response.judge.flags),
        updatedAt: Date.now(),
      },
    }
  }

  function createContextMessage(sessionId: string): ContextMessage | null {
    const record = records.value[sessionId]
    if (!record || (!record.summary && record.facts.length === 0))
      return null

    const textParts = [
      record.lastRoute ? `Route: ${record.lastRoute}` : '',
      record.lastSceneType ? `Scene: ${record.lastSceneType}` : '',
      record.judgeFlags.length ? `Quality flags:\n- ${record.judgeFlags.join('\n- ')}` : '',
      record.summary ? `Summary:\n${record.summary}` : '',
      record.facts.length ? `Facts:\n- ${record.facts.join('\n- ')}` : '',
    ].filter(Boolean)

    return {
      id: nanoid(),
      contextId: `hermes:memory:${sessionId}`,
      strategy: ContextUpdateStrategy.ReplaceSelf,
      text: textParts.join('\n\n'),
      createdAt: Date.now(),
      metadata: {
        source: {
          id: `hermes:memory:${sessionId}`,
          kind: 'plugin',
          plugin: {
            id: 'airi:hermes:memory',
          },
        },
      },
    }
  }

  return {
    records,
    getSessionMemory,
    applyResponse,
    createContextMessage,
  }
})
