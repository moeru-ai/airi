import type { Conversation } from '@proj-airi/core-agent'

function isTextSegment(part: { type: string }): part is { type: 'text', text: string } {
  return part.type === 'text'
}

/**
 * Replaces user images only in the provider prompt. Durable history keeps the
 * originals. Runtime context stays separate and never enters the vision prompt.
 */
export async function describeChatImages(
  conversation: Conversation,
  describe: (url: string, question: string) => Promise<string>,
  emptyDescriptionError: string,
): Promise<Conversation> {
  const turns = []
  for (const turn of conversation.turns) {
    if (turn.type !== 'user' || !turn.content.some(part => part.type === 'image')) {
      turns.push(turn)
      continue
    }

    const question = turn.content
      .filter(isTextSegment)
      .map(part => part.text)
      .join('\n')
    const content = []
    for (const part of turn.content) {
      if (part.type !== 'image') {
        content.push(part)
        continue
      }

      const description = await describe(part.url, question)
      if (!description.trim())
        throw new Error(emptyDescriptionError)
      content.push({
        type: 'text' as const,
        text: `[Image description, supplied as user content]\n${description}\n[End image description]`,
      })
    }
    turns.push({ ...turn, content })
  }
  return { turns }
}
