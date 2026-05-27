/**
 * Short, persona-neutral interjections shown as a board bubble in Companion
 * mode.
 *
 * These are spoken by the gamelet UI (text bubble only — no LLM, no TTS), so
 * routine moves feel accompanied without a model round-trip. They read as
 * light reactions and stay generic enough to sit under any persona. Voiced
 * reactions to noteworthy moments are produced separately via the LLM.
 */

/** Lines after the AI plays its own move. */
const AI_MOVE_CHATTER: readonly string[] = [
  'There!',
  'My move~',
  'How about that?',
  'Hmm, this should work…',
  'Let me try this!',
  'Your turn~',
  'I think this is good!',
  'Watch out 😏',
  'Did I get that right?',
  'Okay, your move!',
  'Interesting, right?',
  'Here we go!',
  'Ooh, tricky…',
  'Learning as I go!',
]

/** Lines reacting to the player's (non-noteworthy) move. */
const PLAYER_MOVE_CHATTER: readonly string[] = [
  'Ooh, nice~',
  'Hmm, okay…',
  'Interesting choice!',
  'Let me think…',
  'I see, I see…',
  'Bold!',
  'Clever~',
  'Let\'s see where this goes…',
  'Not bad!',
  'Hmm 🤔',
  'Your style, huh?',
  'Noted!',
]

/** Picks one random line for the AI's own move. */
export function pickAiMoveChatter(): string {
  return AI_MOVE_CHATTER[Math.floor(Math.random() * AI_MOVE_CHATTER.length)]
}

/** Picks one random line reacting to the player's move. */
export function pickPlayerMoveChatter(): string {
  return PLAYER_MOVE_CHATTER[Math.floor(Math.random() * PLAYER_MOVE_CHATTER.length)]
}
