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
      // The vision inference queue limits how many images are read at once.
      const description = await describe(part.url, question, turn.id, sourceImageIndex)
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

/**
 * Replaces the images in stored tool results with a note, only in the provider
 * prompt. A stored tool result can hold an original image, for example from a
 * turn before the vision model read tool images. The chat store applies this
 * while the vision model reads tool images, so the prompt holds no raw image.
 */
export function replaceToolResultImages(conversation: Conversation, note: string): Conversation {
  return {
    turns: conversation.turns.map((turn) => {
      if (turn.type !== 'assistant')
        return turn

      return {
        ...turn,
        rounds: turn.rounds.map(round => ({
          ...round,
          toolInvocations: round.toolInvocations.map((invocation) => {
            const execution = invocation.execution
            if (!('output' in execution) || !execution.output.some(segment => segment.type === 'image'))
              return invocation

            return {
              ...invocation,
              execution: {
                ...execution,
                output: execution.output.map(segment => segment.type === 'image' ? { type: 'text' as const, text: note } : segment),
              },
            }
          }),
        })),
      }
    }),
  }
}
