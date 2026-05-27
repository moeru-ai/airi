import type { ComputedRef, Ref } from 'vue'

import { computed, ref, watch } from 'vue'

/** localStorage key holding the cross-session companion progression. */
const STORAGE_KEY = 'airi-chess-companion-state'

/** Highest AIRI level the curve clamps to. */
const MAX_LEVEL = 20

/** How many games it takes to gain one level. */
const GAMES_PER_LEVEL = 2

/** Persisted companion progression. */
interface PersistedState {
  gamesPlayed: number
  wins: number
  losses: number
  draws: number
}

const DEFAULT_STATE: PersistedState = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
}

/** Outcome of one finished game, from the human's perspective. */
export type CompanionResult = 'win' | 'loss' | 'draw'

/** Reactive view returned by {@link useCompanionState}. */
export interface CompanionStateView {
  /** Number of finished games on record. */
  gamesPlayed: Ref<number>
  /** Wins by the human. */
  wins: Ref<number>
  /** Losses by the human (AIRI wins). */
  losses: Ref<number>
  /** Drawn games. */
  draws: Ref<number>
  /** AIRI's current strength level, clamped to 1–{@link MAX_LEVEL}. */
  aiLevel: ComputedRef<number>
  /** Persists one finished game's outcome and bumps the games counter. */
  recordResult: (result: CompanionResult) => void
  /** Wipes all progression — fresh start. */
  resetProgress: () => void
}

/**
 * Loads the persisted state from `localStorage`, falling back to a clean slate
 * on any parse error or absence.
 *
 * Before:
 * - `{"gamesPlayed":7,"wins":2,"losses":4,"draws":1}` in storage
 *
 * After:
 * - The same record, with each field defaulted to 0 if missing or malformed.
 */
function loadPersisted(): PersistedState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw)
      return { ...DEFAULT_STATE }
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      gamesPlayed: typeof parsed.gamesPlayed === 'number' ? parsed.gamesPlayed : 0,
      wins: typeof parsed.wins === 'number' ? parsed.wins : 0,
      losses: typeof parsed.losses === 'number' ? parsed.losses : 0,
      draws: typeof parsed.draws === 'number' ? parsed.draws : 0,
    }
  }
  catch {
    return { ...DEFAULT_STATE }
  }
}

/** Writes the state to `localStorage`; silently no-ops if storage is unavailable. */
function savePersisted(state: PersistedState): void {
  try {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
  catch {
    // Storage may be disabled (private mode, quota); progression stays in-memory.
  }
}

/**
 * Tracks the player's cumulative chess journey with AIRI in Companion mode.
 *
 * Use when:
 * - The board is offering the Companion mode where AIRI's level grows with
 *   each finished game
 *
 * Expects:
 * - Runs in a browser context with `localStorage` available; gracefully
 *   degrades to in-memory state if it is not
 *
 * Returns:
 * - A {@link CompanionStateView}. {@link CompanionStateView.recordResult}
 *   should be called exactly once when a game ends. {@link CompanionStateView.aiLevel}
 *   derives from `gamesPlayed` via a 2-games-per-level curve, clamped at 20.
 */
export function useCompanionState(): CompanionStateView {
  const initial = loadPersisted()
  const gamesPlayed = ref(initial.gamesPlayed)
  const wins = ref(initial.wins)
  const losses = ref(initial.losses)
  const draws = ref(initial.draws)

  watch([gamesPlayed, wins, losses, draws], () => {
    savePersisted({
      gamesPlayed: gamesPlayed.value,
      wins: wins.value,
      losses: losses.value,
      draws: draws.value,
    })
  })

  const aiLevel = computed(() => Math.min(MAX_LEVEL, 1 + Math.floor(gamesPlayed.value / GAMES_PER_LEVEL)))

  function recordResult(result: CompanionResult): void {
    gamesPlayed.value += 1
    if (result === 'win')
      wins.value += 1
    else if (result === 'loss')
      losses.value += 1
    else
      draws.value += 1
  }

  function resetProgress(): void {
    gamesPlayed.value = 0
    wins.value = 0
    losses.value = 0
    draws.value = 0
  }

  return { gamesPlayed, wins, losses, draws, aiLevel, recordResult, resetProgress }
}
