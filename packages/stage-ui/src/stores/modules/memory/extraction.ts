import type { Message } from '@xsai/shared-chat'

import type { MemoryType } from '../../../types/memory'

import { minLength, object, picklist, pipe, safeParse, string, trim } from 'valibot'

/** A single durable memory proposed by the extractor LLM, before embedding/storage. */
export interface MemoryCandidate {
  text: string
  type: MemoryType
}

const MEMORY_TYPES = ['preference', 'fact', 'event', 'relationship', 'commitment'] as const

const candidateSchema = object({
  text: pipe(string(), trim(), minLength(1)),
  type: picklist(MEMORY_TYPES),
})

/**
 * System prompt for the memory extractor. Reuses the chat backbone (so memories are phrased in the
 * companion's voice/language) but runs as a separate non-streaming call.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You extract durable long-term memories from a conversation between a user and their AI companion.
List only what is worth remembering across future sessions: the user's preferences, stable facts about the user or their world, relationships and feelings, commitments and plans, and notable events.
Skip small talk, transient state, and anything the companion said about itself.
Write each memory as a short, self-contained statement about the user, in the user's language (for example: "User has a cat named Meiqiu").
Return ONLY a JSON array; each item is { "text": string, "type": "preference" | "fact" | "event" | "relationship" | "commitment" }. Return [] when nothing is worth remembering.`

/**
 * Builds the extractor chat messages for a window of recent conversation.
 *
 * @param conversationText - The recent turns rendered as `Speaker: text` lines.
 */
export function buildExtractionMessages(conversationText: string): Message[] {
  return [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: `Conversation:\n${conversationText}\n\nExtract the durable memories as a JSON array.` },
  ]
}

/**
 * Parses the extractor reply into validated candidates.
 *
 * Tolerates a ```json fence or an array embedded in prose (the `[ ... ]` slice is taken directly,
 * which also unwraps a fenced block), and validates each item independently so one malformed entry
 * does not drop the rest. Returns [] on any parse failure — extraction must never throw into a chat
 * turn.
 *
 * Before:
 * - "```json\n[{\"text\":\"User likes tea\",\"type\":\"preference\"},{\"bad\":1}]\n```"
 *
 * After:
 * - [{ text: "User likes tea", type: "preference" }]
 */
export function parseExtractedFacts(llmText: string): MemoryCandidate[] {
  const raw = llmText.trim()
  if (!raw)
    return []

  const jsonText = (raw.match(/\[[\s\S]*\]/)?.[0] ?? raw).trim()

  let data: unknown
  try {
    data = JSON.parse(jsonText)
  }
  catch {
    return []
  }

  if (!Array.isArray(data))
    return []

  const out: MemoryCandidate[] = []
  for (const item of data) {
    const result = safeParse(candidateSchema, item)
    if (result.success)
      out.push(result.output)
  }
  return out
}
