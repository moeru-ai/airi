/**
 * What the bubble shows once precedence has been applied.
 *
 * The bubble shows one thing at a time. A turn in progress outranks a count of
 * messages the user has not seen, because the turn is happening now and the
 * count keeps until the chat window opens.
 */
export type PresenceBubbleContent
  = { kind: 'thinking', phase: number }
    | { kind: 'unread', count: number }

/** Everything the stage knows that can put something above the character. */
export interface PresenceBubbleState {
  /** A model turn is running. */
  thinking: boolean
  /** Messages appended while the chat window was hidden. */
  unreadCount: number
}

/**
 * Nothing to show above the character.
 *
 * Frozen and shared so every default resolves to one identity. A default that
 * built an object per call would be a new reference each time, and anything
 * watching presence would rerun on every render.
 */
export const presenceBubbleIdle: PresenceBubbleState = Object.freeze({ thinking: false, unreadCount: 0 })

/**
 * Number of distinct frames in the thinking animation.
 *
 * The dots are painted, so every distinct frame costs a repaint and a texture
 * upload. Quantizing the cycle bounds that cost independently of the display's
 * refresh rate, and gives the dots the stepped look of limited animation rather
 * than a smooth fade.
 */
export const presenceBubbleDotPhases = 8

/** One full pass of the thinking dots, in milliseconds. */
export const presenceBubbleDotCycleMs = 1100

/**
 * Applies the precedence rule and returns what to paint, or `undefined` when the
 * bubble should not be drawn at all.
 *
 * @param state - What the stage knows right now.
 * @param elapsedMs - Time since the stage started, used to advance the dots.
 *
 * @example
 * resolvePresenceBubbleContent({ thinking: false, unreadCount: 14 }, 0)
 * // => { kind: 'unread', count: 14 }
 */
export function resolvePresenceBubbleContent(
  state: PresenceBubbleState,
  elapsedMs: number,
): PresenceBubbleContent | undefined {
  if (state.thinking) {
    const progress = (elapsedMs % presenceBubbleDotCycleMs) / presenceBubbleDotCycleMs
    return { kind: 'thinking', phase: Math.floor(progress * presenceBubbleDotPhases) }
  }

  if (state.unreadCount > 0)
    return { kind: 'unread', count: state.unreadCount }

  return undefined
}

/**
 * Formats an unread count for a badge that must stay small.
 *
 * @example
 * formatUnreadBadge(128)
 * // => '99+'
 */
export function formatUnreadBadge(count: number) {
  return count > 99 ? '99+' : String(Math.max(0, Math.trunc(count)))
}
