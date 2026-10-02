import type { AssistantTurn, RoundContent } from './types'

/** Marks the point where playback stopped. */
const CUT_MARK = '…'

/**
 * Replaces the text of an assistant turn with the speech that the listener heard.
 *
 * Use when:
 * - A voice reply was interrupted, and the next prompt must not assume the rest was said.
 *
 * Returns:
 * - A copy whose text is only the delivered speech, with a cut mark. Tool calls and other content stay.
 */
export function deliveredSpeechTurn(turn: AssistantTurn, deliveredSpeech: string): AssistantTurn {
  const copy = structuredClone(turn)
  const spoken = `${deliveredSpeech.trimEnd()}${CUT_MARK}`
  let placed = false
  for (const round of copy.rounds.toReversed()) {
    round.content = round.content.flatMap((segment): RoundContent[] => {
      if (segment.type !== 'text')
        return [segment]
      if (placed)
        return []
      placed = true
      return [{ type: 'text', text: spoken }]
    })
  }
  if (!placed)
    copy.rounds.at(-1)?.content.push({ type: 'text', text: spoken })
  return copy
}

/** Replaces the text of a plain assistant message with the delivered speech and a cut mark. */
export function deliveredSpeechText(deliveredSpeech: string) {
  return `${deliveredSpeech.trimEnd()}${CUT_MARK}`
}
