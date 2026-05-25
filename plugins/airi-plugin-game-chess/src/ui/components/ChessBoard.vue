<script setup lang="ts">
import type { Color, PieceSymbol, Square } from 'chess.js'

import type { CommentaryMode } from '../coach/coachTurn'
import type { SemanticEvent } from '../game/gameEvents'

import { computed, ref, shallowRef, watch } from 'vue'

import boardUrl from '../assets/boards/blue-marble.jpg'

import { useHostBridge } from '../bridge/useHostBridge'
import { coachTurnFor, companionMoveTurn } from '../coach/coachTurn'
import { pickAiMoveChatter, pickPlayerMoveChatter } from '../coach/companionChatter'
import { useEngineReview } from '../engine/useEngineReview'
import { useChessGame } from '../game/useChessGame'
import { useChessOpponent } from '../game/useChessOpponent'
import { useCompanionState } from '../game/useCompanionState'
import { useGameSession } from '../game/useGameSession'

/**
 * Interactive chess board for the gamelet.
 *
 * Use when:
 * - The gamelet shell needs a playable, click-to-move board
 *
 * Expects:
 * - `initialFen`, when given, is a legal FEN accepted by chess.js
 *
 * Returns:
 * - A self-contained board: it owns its {@link useChessGame} state, renders
 *   selection, legal-target, last-move and check highlights plus the promotion
 *   picker, runs each played move through {@link useEngineReview} for a quality
 *   label, and surfaces the {@link useGameSession} semantic-event stream. Rule
 *   enforcement lives entirely in `useChessGame`.
 */
const props = defineProps<{ initialFen?: string }>()

const game = useChessGame(props.initialFen)
const {
  cells,
  turn,
  selected,
  legalTargets,
  lastMove,
  checkSquare,
  status,
  pendingPromotion,
  selectSquare,
  choosePromotion,
  reset,
} = game

const engine = useEngineReview()
const bridge = useHostBridge(engine)
const opponent = useChessOpponent(game, engine)
const { mode: opponentMode, userColor, strength: opponentStrength, skillLevel: opponentSkillLevel, thinking: engineThinking, inputLocked } = opponent

/**
 * Top-level play mode.
 * - `coach` (current): user picks opponent / strength / verbosity freely; coach
 *   speaks only on noteworthy moments.
 * - `companion`: AIRI is your learning partner — Stockfish opponent is forced,
 *   strength is auto-progressed (placeholder this step), commentary is brief
 *   and per-move. Companion-specific state lands in later steps.
 */
const playMode = ref<'coach' | 'companion'>('coach')

/** How chatty the coach should be. Default `'brief'` for fast play. */
const commentaryMode = ref<CommentaryMode>('brief')

const companionPlayerColor = ref<Color>(userColor.value)

function snapshotCompanionPlayerColor(): void {
  companionPlayerColor.value = userColor.value
}

// In companion mode the opponent + verbosity are not user choices — they are
// part of the mode contract. Watch the mode toggle and snap settings into
// place so the UI cannot be left in an inconsistent state.
watch(playMode, (mode) => {
  if (mode === 'companion') {
    snapshotCompanionPlayerColor()
    opponentMode.value = 'stockfish'
    opponentStrength.value = 'intermediate'
    commentaryMode.value = 'brief'
  }
}, { immediate: true })

const companion = useCompanionState()
const { gamesPlayed, wins, losses, draws, aiLevel, recordResult, resetProgress } = companion

// In Companion mode the AIRI level drives the Stockfish `Skill Level`
// directly (1→1 weakest, 20→20 strongest). In Coach mode we clear it so
// the engine plays at full strength again.
watch([playMode, aiLevel], ([mode, level]) => {
  opponentSkillLevel.value = mode === 'companion' ? Math.min(20, Math.max(0, level)) : undefined
}, { immediate: true })

// When a Companion-mode game reaches a terminal status, record the outcome
// against the player. The status transition fires once per game end; resets
// move it back to `playing` without re-triggering.
watch(status, (newStatus, oldStatus) => {
  if (playMode.value !== 'companion')
    return
  if (newStatus === oldStatus)
    return
  if (newStatus === 'checkmate') {
    // The mated side cannot move; whoever moved last is the winner.
    const winnerColor = turn.value === 'w' ? 'b' : 'w'
    recordResult(winnerColor === companionPlayerColor.value ? 'win' : 'loss')
  }
  else if (newStatus === 'stalemate' || newStatus === 'draw') {
    recordResult('draw')
  }
})

/**
 * Move currently being narrated by the coach, kept on the board as a purple
 * ring even if the spoken line lags a few seconds — without this the user
 * loses track of which move the voice is on when play runs faster than TTS.
 */
const commentingMove = shallowRef<{ from: Square, to: Square } | null>(null)

/** Transient board bubble for the Companion AI's lightweight self-chatter. */
const chatterBubble = ref<string | null>(null)
let chatterTimer: ReturnType<typeof setTimeout> | undefined

/** Chance a Companion engine move is voiced (LLM) rather than a free text bubble. */
const COMPANION_VOICE_CHANCE = 0.3

/** Shows one chatter line in a board bubble that fades after a few seconds. */
function showChatter(text: string): void {
  chatterBubble.value = text
  clearTimeout(chatterTimer)
  chatterTimer = setTimeout(() => {
    chatterBubble.value = null
  }, 3500)
}

/**
 * Reacts to the Companion AI having just played its own move: mostly a free
 * text bubble (no model call, no TTS lag), occasionally a full voiced LLM turn
 * so the AI feels present every move without the cost or pace cost of speaking
 * every time.
 */
function onCompanionEngineMove(moveUci: string): void {
  if (Math.random() < COMPANION_VOICE_CHANCE)
    bridge.requestAiTurn(companionMoveTurn(moveUci, commentaryMode.value))
  else
    showChatter(pickAiMoveChatter())
}

/**
 * Routes one session event to the coach pipeline.
 *
 * Engine moves: silent in Coach mode; in Companion mode they trigger the AI's
 * own light self-chatter. Everything else goes through `coachTurnFor`; when it
 * returns a request we kick the host AI turn and remember which move (if any)
 * the upcoming reaction is about.
 */
function onSessionEvent(event: SemanticEvent): void {
  if (event.kind === 'move' && opponent.isEngineMove(event.mover)) {
    if (playMode.value === 'companion')
      onCompanionEngineMove(event.moveUci)
    return
  }
  const request = coachTurnFor(event, commentaryMode.value)
  if (request === null) {
    // Companion mode stays chatty: a routine player move the coach would skip
    // still gets a free, voice-less board bubble so every move feels noticed.
    if (playMode.value === 'companion' && event.kind === 'move')
      showChatter(pickPlayerMoveChatter())
    return
  }
  if (event.kind === 'move')
    commentingMove.value = { from: event.moveUci.slice(0, 2) as Square, to: event.moveUci.slice(2, 4) as Square }
  bridge.requestAiTurn(request)
}

const { events } = useGameSession(game, engine, {
  onEvent: onSessionEvent,
  onAfterMove: () => opponent.maybeRespond(),
})

// If the user toggles the opponent on mid-game, the engine may suddenly owe a
// move — kick it once for the new configuration.
watch(opponentMode, () => {
  void opponent.maybeRespond()
})

watch(userColor, () => {
  if (playMode.value === 'companion' && lastMove.value === null)
    snapshotCompanionPlayerColor()
  void opponent.maybeRespond()
})

/**
 * Resets the board and, if the engine is configured to play the first move
 * (e.g. user picked Black against Stockfish), lets it take its turn now.
 */
async function handleReset(): Promise<void> {
  commentingMove.value = null
  chatterBubble.value = null
  snapshotCompanionPlayerColor()
  reset()
  await opponent.maybeRespond()
}

/**
 * URL map for the cardinal piece SVGs (white/black × 6 piece types).
 *
 * `import.meta.glob` with `eager: true` lets Vite bundle the assets and emit
 * hashed URLs at build time; the key carries the file name `wK`/`bQ`/... that
 * we use to look up the piece for any cell.
 */
const PIECE_URL_BY_CODE: Record<string, string> = Object.fromEntries(
  Object
    .entries(import.meta.glob<string>('../assets/pieces/cardinal/*.svg', { eager: true, import: 'default' }))
    .map(([path, url]) => {
      const code = path.split('/').pop()!.replace('.svg', '')
      return [code, url]
    }),
)

/** Promotion targets, strongest first, shown in the picker overlay. */
const PROMOTION_CHOICES: PieceSymbol[] = ['q', 'r', 'b', 'n']

/** Human-readable status line shown above the board. */
const statusText = computed<string>(() => {
  const mover = turn.value === 'w' ? 'White' : 'Black'
  switch (status.value) {
    case 'checkmate':
      return `Checkmate — ${turn.value === 'w' ? 'Black' : 'White'} wins`
    case 'stalemate':
      return 'Stalemate — draw'
    case 'draw':
      return 'Draw'
    case 'check':
      return `${mover} to move — check`
    default:
      return `${mover} to move`
  }
})

/** Engine line: boot/analysis progress, or the last move's quality verdict. */
const reviewText = computed<string>(() => {
  if (engine.error.value)
    return `Engine error: ${engine.error.value}`
  if (opponentMode.value === 'stockfish' && engine.opponentError.value)
    return `Opponent engine error: ${engine.opponentError.value}`
  if (!engine.ready.value)
    return 'Engine loading…'
  if (opponentMode.value === 'stockfish' && !engine.opponentReady.value)
    return 'Opponent engine loading…'
  if (engine.analyzing.value)
    return 'Analyzing…'
  const move = engine.lastMove.value
  if (!move)
    return 'Engine ready'
  const label = move.classification[0].toUpperCase() + move.classification.slice(1)
  return move.cpLoss > 0 ? `${label} · −${move.cpLoss} cp` : label
})

/** The event log newest-first, so the latest semantic event reads at the top. */
const recentEvents = computed<SemanticEvent[]>(() => [...events.value].reverse())

/**
 * Cells in display order. When the human plays Black the board is rotated
 * 180° so the human's pieces sit at the bottom — `chess.com` convention.
 * The square coordinates inside each cell stay correct, so click handlers
 * and highlights need no adjustment.
 */
const displayCells = computed(() => {
  const c = cells.value
  if (userColor.value === 'w')
    return c
  return c.map(row => [...row].reverse()).reverse()
})

/** Looks up the cardinal SVG URL for one piece — e.g. white queen → `wQ.svg`. */
function pieceUrl(color: 'w' | 'b', type: PieceSymbol): string {
  return PIECE_URL_BY_CODE[`${color}${type.toUpperCase()}`]
}

/** Spoken accessibility label for one piece. */
function pieceAlt(color: 'w' | 'b', type: PieceSymbol): string {
  const PIECE_NAMES: Record<PieceSymbol, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }
  return `${color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[type]}`
}

function isLastMove(square: Square): boolean {
  const move = lastMove.value
  return move !== null && (move.from === square || move.to === square)
}

/** True when this square belongs to the move the coach is currently narrating. */
function isCommentingSquare(square: Square): boolean {
  const move = commentingMove.value
  return move !== null && (move.from === square || move.to === square)
}

/** One-line label for a semantic event in the debug log. */
function eventLabel(event: SemanticEvent): string {
  switch (event.kind) {
    case 'session_greeting':
      return 'Session greeting'
    case 'game_start':
      return 'Game start'
    case 'game_end':
      return `Game end — ${event.result}`
    case 'checkmate':
      return `Checkmate — ${event.winner} wins`
    case 'in_check':
      return 'Check'
    case 'user_idle':
      return 'User idle'
    case 'momentum_swing':
      return `Momentum swing (${event.fromCp} → ${event.toCp})`
    case 'move':
      return `Move ${event.moveUci} — ${event.classification}`
    default:
      return 'Unknown event'
  }
}
</script>

<template>
  <div :class="['flex items-start gap-6', 'select-none']">
    <div :class="['flex flex-col items-center gap-3']">
      <div :class="['flex flex-col items-center gap-2', 'text-xs text-neutral-700']">
        <div :class="['flex items-center gap-3']">
          <label :class="['flex items-center gap-1']">
            <span>Mode</span>
            <select
              v-model="playMode"
              :class="['rounded border border-neutral-300 bg-white px-2 py-1']"
            >
              <option value="coach">Coach</option>
              <option value="companion">Companion</option>
            </select>
          </label>
          <label :class="['flex items-center gap-1']">
            <span>Play as</span>
            <select
              v-model="userColor"
              :class="['rounded border border-neutral-300 bg-white px-2 py-1']"
            >
              <option value="w">White</option>
              <option value="b">Black</option>
            </select>
          </label>
        </div>
        <div v-if="playMode === 'coach'" :class="['flex items-center gap-3']">
          <label :class="['flex items-center gap-1']">
            <span>Opponent</span>
            <select
              v-model="opponentMode"
              :class="['rounded border border-neutral-300 bg-white px-2 py-1']"
            >
              <option value="manual">Pass &amp; play</option>
              <option value="stockfish">Stockfish</option>
            </select>
          </label>
          <label :class="['flex items-center gap-1', { 'opacity-50': opponentMode === 'manual' }]">
            <span>Strength</span>
            <select
              v-model="opponentStrength"
              :disabled="opponentMode === 'manual'"
              :class="['rounded border border-neutral-300 bg-white px-2 py-1']"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="strong">Strong</option>
              <option value="monster">Monster</option>
            </select>
          </label>
          <label :class="['flex items-center gap-1']">
            <span>Commentary</span>
            <select
              v-model="commentaryMode"
              :class="['rounded border border-neutral-300 bg-white px-2 py-1']"
            >
              <option value="brief">Brief</option>
              <option value="interactive">Interactive</option>
            </select>
          </label>
        </div>
        <div v-else :class="['flex items-center gap-3', 'text-neutral-700']">
          <span :class="['font-medium']">AIRI Lv.{{ aiLevel }}</span>
          <span :class="['text-neutral-400']">·</span>
          <span>Games {{ gamesPlayed }}</span>
          <span :class="['text-neutral-400']">·</span>
          <span>W/L/D {{ wins }}/{{ losses }}/{{ draws }}</span>
          <button
            type="button"
            :class="['text-neutral-400 underline hover:text-neutral-600']"
            @click="resetProgress()"
          >
            reset progress
          </button>
        </div>
      </div>

      <p :class="['text-sm font-medium text-neutral-700']">
        {{ statusText }}<span v-if="engineThinking" :class="['ml-2 text-neutral-400']">· Stockfish thinking…</span>
      </p>

      <div
        :class="['relative', 'rounded-md overflow-hidden shadow-xl']"
        :style="{ backgroundImage: `url(${boardUrl})`, backgroundSize: '512px 512px' }"
      >
        <div
          v-for="(row, rank) in displayCells"
          :key="rank"
          :class="['flex']"
        >
          <button
            v-for="cell in row"
            :key="cell.square"
            type="button"
            :class="[
              'relative h-16 w-16',
              'flex items-center justify-center',
              'bg-transparent',
              inputLocked ? 'cursor-not-allowed' : 'cursor-pointer',
            ]"
            :disabled="inputLocked"
            @click="selectSquare(cell.square)"
          >
            <span
              v-if="isLastMove(cell.square)"
              :class="['absolute inset-0', 'bg-[#f6f669]/45']"
            />
            <span
              v-if="cell.square === checkSquare"
              :class="['absolute inset-0', 'bg-[#e33]/55']"
            />
            <span
              v-if="cell.square === selected"
              :class="['absolute inset-0', 'bg-[#f6f669]/70']"
            />
            <span
              v-if="legalTargets.has(cell.square)"
              :class="[
                'absolute',
                cell.piece
                  ? 'inset-1 rounded-full ring-4 ring-black/25'
                  : 'h-5 w-5 rounded-full bg-black/30',
              ]"
            />
            <span
              v-if="isCommentingSquare(cell.square)"
              :class="['absolute inset-0', 'ring-4 ring-inset ring-[#a855f7]/80']"
            />
            <img
              v-if="cell.piece"
              :src="pieceUrl(cell.piece.color, cell.piece.type)"
              :alt="pieceAlt(cell.piece.color, cell.piece.type)"
              :class="['relative h-14 w-14', 'drop-shadow-md', 'pointer-events-none']"
            >
          </button>
        </div>

        <div
          v-if="pendingPromotion"
          :class="[
            'absolute inset-0 z-10',
            'flex items-center justify-center',
            'bg-black/55',
          ]"
        >
          <div :class="['flex gap-2', 'rounded-lg bg-white p-3 shadow-xl']">
            <button
              v-for="choice in PROMOTION_CHOICES"
              :key="choice"
              type="button"
              :class="[
                'h-14 w-14',
                'flex items-center justify-center',
                'rounded bg-neutral-100 hover:bg-neutral-200',
              ]"
              @click="choosePromotion(choice)"
            >
              <img
                :src="pieceUrl(turn, choice)"
                :alt="pieceAlt(turn, choice)"
                :class="['h-12 w-12']"
              >
            </button>
          </div>
        </div>

        <div
          v-if="chatterBubble"
          :class="[
            'absolute left-1/2 top-2 z-20 -translate-x-1/2',
            'rounded-full bg-black/70 px-3 py-1',
            'text-sm text-white whitespace-nowrap',
            'pointer-events-none',
          ]"
        >
          {{ chatterBubble }}
        </div>
      </div>

      <p :class="['text-sm text-neutral-500', 'h-5']">
        {{ reviewText }}
      </p>

      <button
        type="button"
        :class="[
          'rounded px-4 py-1.5',
          'text-sm font-medium text-white',
          'bg-neutral-700 hover:bg-neutral-600',
        ]"
        @click="handleReset()"
      >
        Reset
      </button>
    </div>

    <div :class="['w-56', 'flex flex-col gap-1']">
      <p :class="['text-xs font-semibold uppercase tracking-wide text-neutral-400']">
        Events
      </p>
      <p
        v-if="recentEvents.length === 0"
        :class="['text-sm text-neutral-400']"
      >
        No events yet.
      </p>
      <p
        v-for="(event, index) in recentEvents"
        :key="`${index}-${event.kind}`"
        :class="['text-sm text-neutral-600']"
      >
        {{ eventLabel(event) }}
      </p>
    </div>
  </div>
</template>
