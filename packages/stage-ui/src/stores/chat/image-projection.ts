import type { Conversation } from '@proj-airi/core-agent'

import { Semaphore } from 'es-toolkit'

const CHAT_IMAGE_DESCRIPTION_CONCURRENCY = 4
const chatImageDescriptionSlots = new Semaphore(CHAT_IMAGE_DESCRIPTION_CONCURRENCY)

function isTextSegment(part: { type: string }): part is { type: 'text', text: string } {
  return part.type === 'text'
}

/**
 * Replaces user images only in the provider prompt. Durable history keeps the
 * originals. Runtime context stays separate and never enters the vision prompt.
 */
export async function describeChatImages(
  conversation: Conversation,
  describe: (url: string, question: string, turnId: string, imageIndex: number) => Promise<string>,
  emptyDescriptionError: string,
): Promise<Conversation> {
  const turns = await Promise.all(conversation.turns.map(async (turn) => {
    if (turn.type !== 'user' || !turn.content.some(part => part.type === 'image')) {
      return turn
    }

    const question = turn.content
      .filter(isTextSegment)
      .map(part => part.text)
      .join('\n')
    let imageIndex = 0
    const content = await Promise.all(turn.content.map(async (part) => {
      if (part.type !== 'image')
        return part

      const sourceImageIndex = imageIndex
      imageIndex += 1
      await chatImageDescriptionSlots.acquire()
      let description: string
      try {
        description = await describe(part.url, question, turn.id, sourceImageIndex)
      }
      finally {
        chatImageDescriptionSlots.release()
      }
      if (!description.trim())
        throw new Error(emptyDescriptionError)
      return {
        type: 'text' as const,
        text: `[Image description, supplied as user content]\n${description}\n[End image description]`,
      }
    }))
    return { ...turn, content }
  }))
  return { turns }
}
