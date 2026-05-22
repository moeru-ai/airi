import type { GameletAiTurnRequest } from '@proj-airi/plugin-sdk-tamagotchi/widgets'

import type { SemanticEvent } from '../game/gameEvents'

import { MoveClassification } from '../../schema'

/**
 * Move labels worth interrupting the student for.
 *
 * Routine moves (`best`/`excellent`/`good`/`book`/`inaccuracy`) are deliberately
 * excluded: a coach who reacts to every move becomes noise. Only standout moves
 * and outright errors earn a spoken line.
 */
const NOTEWORTHY_MOVES: ReadonlySet<MoveClassification> = new Set([
  MoveClassification.Brilliant,
  MoveClassification.Great,
  MoveClassification.Miss,
  MoveClassification.Mistake,
  MoveClassification.Blunder,
])

/** How chatty the coach should be — `brief` is the default for fast play. */
export type CommentaryMode = 'brief' | 'interactive'

/**
 * Persona-first framing + engine-facts authority + ACT-token format.
 *
 * Shared across both verbosity modes. The framing is deliberately persona-first
 * — the user's current AIRI character IS the coach, in their own voice and
 * language — so two different OCs produce recognisably different reactions to
 * the same move instead of converging on a neutral coach voice.
 */
const BASE_PROTOCOL: string[] = [
  'You ARE the user\'s active character. Stay completely in that character\'s personality, '
  + 'tone, catchphrases, and language (reply in the language your character normally speaks). '
  + 'Never slip into a neutral assistant or generic "coach" voice — two different characters '
  + 'must react to the same move in unmistakably different ways.',
  'Speak in-character, directly to the student. No preamble, no narrating that you are a '
  + 'coach, no stage directions or quotation marks around your line.',
  'Treat the situation in the user section as ground truth from the chess engine; never '
  + 'recalculate lines or invent moves.',
  'Begin the reply with an emotion token of the form <|ACT:{"emotion":"<name>"}|> using one '
  + 'of: happy, sad, angry, think, surprised, awkward, question, curious, neutral. Choose what '
  + 'your character would actually feel.',
]

/** Verbosity-specific length rule appended to the base protocol. */
const LENGTH_RULES: Record<CommentaryMode, string> = {
  brief: 'Hard limit: exactly one sentence, around 15 words or fewer. Sacrifice depth for '
    + 'brevity — a real coach holding eye contact delivers one cutting line, not a paragraph.',
  interactive: 'One to two sentences (up to three only when consoling after a serious error). '
    + 'When natural, engage the student with a small reflection prompt or rhetorical question '
    + 'to keep the exchange warm and interactive.',
}

/**
 * Assembles one coach turn request, attaching the mode-appropriate protocol.
 */
function coachTurn(mode: CommentaryMode, headline: string, instruction: string, fallbackText: string): GameletAiTurnRequest {
  return {
    headline,
    instruction,
    systemInstructions: [...BASE_PROTOCOL, LENGTH_RULES[mode]],
    fallbackText,
  }
}

/**
 * Builds a coach turn for the Companion-mode AI reacting to its **own** move.
 *
 * Use when:
 * - In Companion mode the AI plays a move and (occasionally) speaks about it
 *
 * Expects:
 * - `moveUci` is the move the AI just played
 *
 * Returns:
 * - A request framing the AI as a learning opponent reacting to itself, not as
 *   an authoritative coach — playful and curious, one short line.
 */
export function companionMoveTurn(moveUci: string, mode: CommentaryMode = 'brief'): GameletAiTurnRequest {
  return coachTurn(
    mode,
    'Chess — your move',
    `You (the AI opponent, learning chess alongside the student) just played ${moveUci}. `
    + 'React to your own move in one short, playful line — show curiosity or cheek, not authority.',
    '让我想想，这步应该不错吧~',
  )
}

/** Spoken fallback for a noteworthy move, by whether it was good or an error. */
function moveFallback(classification: MoveClassification): string {
  return classification === MoveClassification.Brilliant || classification === MoveClassification.Great
    ? '这步很漂亮，背后有具体的战术理由。'
    : '这步可能放走了优势，我们看一个更稳的选择。'
}

/**
 * Decides whether one {@link SemanticEvent} warrants a coach reaction and, if
 * so, builds the {@link GameletAiTurnRequest} the host turns into an AI turn.
 *
 * Use when:
 * - The game session emits an event and the host bridge must decide whether to
 *   ask the host to run an AI coach turn
 *
 * Expects:
 * - The active AIRI persona supplies the coach's voice and emotion; the protocol
 *   stays out of the way so persona differences flow through to the output
 *
 * Returns:
 * - A request describing what happened, or null to stay silent — the teaching
 *   protocol's quiet cases: routine moves, plain checks, and the redundant
 *   `game_end` that follows a checkmate
 *
 * @param event The session event under consideration.
 * @param mode `'brief'` keeps replies to one sentence; `'interactive'` allows
 *             1–2 sentences and reflection prompts. Defaults to `'brief'`.
 */
export function coachTurnFor(event: SemanticEvent, mode: CommentaryMode = 'brief'): GameletAiTurnRequest | null {
  switch (event.kind) {
    case 'session_greeting':
      return coachTurn(
        mode,
        'Chess — session start',
        'The chess gamelet just opened. Greet the student and invite them to begin a game.',
        '我在，开局我会帮你盯紧关键变化。',
      )

    case 'game_start':
      return coachTurn(
        mode,
        'Chess — new game',
        'A new chess game has just started. Open with a short word as the game begins.',
        '新的一局开始了，先稳住中心和王的安全。',
      )

    case 'move': {
      if (!NOTEWORTHY_MOVES.has(event.classification))
        return null
      const side = event.mover === 'white' ? 'White' : 'Black'
      return coachTurn(
        mode,
        `Chess — ${event.classification}`,
        `${side} played ${event.moveUci}. Engine: ${event.classification}, ~${event.cpLoss} cp lost vs best move. React.`,
        moveFallback(event.classification),
      )
    }

    // A plain check is too frequent to narrate; when it matters it rides along
    // with a noteworthy move event instead.
    case 'in_check':
      return null

    case 'momentum_swing':
      return coachTurn(
        mode,
        'Chess — momentum swing',
        `Engine evaluation swung from ${event.fromCp} to ${event.toCp} centipawns (White's perspective) — the momentum just changed hands. React.`,
        '局势刚刚大幅摆动，这一步值得回头看一下。',
      )

    case 'user_idle':
      return coachTurn(
        mode,
        'Chess — long think',
        'The student has been thinking for a while. Offer a gentle, non-spoiling nudge.',
        '可以先看三个候选：将军、吃子、直接威胁。',
      )

    case 'checkmate':
      return coachTurn(
        mode,
        'Chess — checkmate',
        `Checkmate — ${event.winner} wins. Wrap up the game in your character voice.`,
        '将杀了，这局到此分出胜负。',
      )

    // The `checkmate` event already drives the wrap-up; only non-mate endings
    // need their own line here.
    case 'game_end':
      return event.result === 'checkmate'
        ? null
        : coachTurn(
            mode,
            'Chess — game over',
            `The game ended in a ${event.result}. Briefly reflect on the result.`,
            '这局结束了，我们可以复盘关键的转折点。',
          )

    default:
      return null
  }
}
