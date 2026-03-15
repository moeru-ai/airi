import type { MemoryIngestChatTurnEvent, MemoryKind, MemoryUpsertInput } from '@proj-airi/server-sdk'

import type { MemoryModuleConfig } from './types.js'

import { summarizeText, uniqueStrings } from './text.js'
import { MEMORY_KIND_TAGS } from './types.js'

const EXPLICIT_MEMORY_RE = /\b(?:remember|don't forget|do not forget|keep in mind|important)\b/i
const PREFERENCE_RE = /\b(?:i like|i love|i prefer|my favorite|i dislike|i hate|i enjoy)\b/i
const IDENTITY_RE = /\b(?:my name is|call me|i am|i'm)\b/i
const GOAL_RE = /\b(?:i need to|i want to|i plan to|remind me|please remind me|i should)\b/i
const RELATIONSHIP_RE = /\b(?:we agreed|you promised|between us|our plan)\b/i

function createMemoryCandidate(
  event: MemoryIngestChatTurnEvent,
  kind: MemoryKind,
  content: string,
  options?: {
    importance?: number
    tags?: string[]
    summary?: string
  },
): MemoryUpsertInput {
  return {
    scope: event.scope,
    kind,
    content,
    summary: options?.summary || summarizeText(content),
    importance: options?.importance ?? 6,
    confidence: 0.75,
    emotionalIntensity: 0,
    tags: uniqueStrings([
      ...(event.tags || []),
      ...(options?.tags || []),
      ...MEMORY_KIND_TAGS[kind],
    ]),
    metadata: {
      ...event.metadata,
      inferred: true,
    },
    source: {
      kind: 'chat-turn',
      actor: 'user',
      module: event.scope.module,
    },
  }
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map(sentence => sentence.trim())
    .filter(Boolean)
}

export function extractMemoryCandidates(event: MemoryIngestChatTurnEvent, config: MemoryModuleConfig): MemoryUpsertInput[] {
  const candidates: MemoryUpsertInput[] = []
  const userMessage = event.userMessage?.trim()
  const assistantMessage = event.assistantMessage?.trim()

  if (userMessage) {
    for (const sentence of splitSentences(userMessage)) {
      if (PREFERENCE_RE.test(sentence)) {
        candidates.push(createMemoryCandidate(event, 'preference', sentence, {
          importance: 8,
          tags: ['preference'],
          summary: `User preference: ${summarizeText(sentence, 120)}`,
        }))
      }

      if (IDENTITY_RE.test(sentence)) {
        candidates.push(createMemoryCandidate(event, 'fact', sentence, {
          importance: 9,
          tags: ['identity'],
          summary: `User profile fact: ${summarizeText(sentence, 120)}`,
        }))
      }

      if (GOAL_RE.test(sentence)) {
        candidates.push(createMemoryCandidate(event, 'goal', sentence, {
          importance: 8,
          tags: ['goal', 'follow-up'],
          summary: `User goal: ${summarizeText(sentence, 120)}`,
        }))
      }

      if (RELATIONSHIP_RE.test(sentence)) {
        candidates.push(createMemoryCandidate(event, 'relationship', sentence, {
          importance: 8,
          tags: ['relationship'],
          summary: `Relationship context: ${summarizeText(sentence, 120)}`,
        }))
      }

      if (event.explicit || EXPLICIT_MEMORY_RE.test(sentence)) {
        candidates.push(createMemoryCandidate(event, 'semantic', sentence, {
          importance: 9,
          tags: ['explicit-memory'],
          summary: `Explicit memory cue: ${summarizeText(sentence, 120)}`,
        }))
      }
    }
  }

  if (userMessage && (event.explicit || candidates.length > 0)) {
    const episodicContent = [
      `User said: ${userMessage}`,
      assistantMessage ? `Assistant replied: ${assistantMessage}` : '',
    ].filter(Boolean).join('\n')

    candidates.push(createMemoryCandidate(event, 'episodic', episodicContent, {
      importance: event.explicit ? 8 : 6,
      tags: ['chat-turn'],
      summary: summarizeText(userMessage, 140),
    }))
  }

  if (assistantMessage && config.heuristics.keepAssistantEpisodic && !userMessage) {
    candidates.push({
      scope: event.scope,
      kind: 'episodic',
      content: `Assistant reply: ${assistantMessage}`,
      summary: summarizeText(assistantMessage, 140),
      importance: 4,
      confidence: 0.5,
      emotionalIntensity: 0,
      tags: uniqueStrings(['assistant-episodic', ...(event.tags || [])]),
      metadata: {
        ...event.metadata,
        inferred: true,
      },
      source: {
        kind: 'chat-turn',
        actor: 'assistant',
        module: event.scope.module,
      },
    })
  }

  return candidates
}
