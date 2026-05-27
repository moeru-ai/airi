import type { AnalysisResult, EngineLine, EngineScore } from '../schema'

import { safeParse } from 'valibot'

import { fenSchema } from '../schema'

/**
 * Minimal duplex contract for exchanging UCI text with a Stockfish engine.
 *
 * Production wires this to a Web Worker loaded from a stockfish.js build; unit
 * tests wire a fake that records sent commands and replays canned output. The
 * engine logic depends only on this contract, never on `Worker` directly.
 */
export interface UciTransport {
  /** Sends one raw UCI command line to the engine. */
  send: (command: string) => void
  /** Subscribes to raw UCI output lines; returns an unsubscribe function. */
  onLine: (listener: (line: string) => void) => () => void
  /** Releases the underlying worker/process. */
  terminate: () => void
}

/**
 * Knobs for a single {@link ChessEngine.analyze} call.
 */
export interface AnalyzeOptions {
  /**
   * Fixed search depth in plies.
   * @default 15
   */
  depth?: number
  /**
   * Number of distinct lines to return (UCI MultiPV). Use >1 to obtain
   * candidate moves for the `great`/`miss` classification heuristics.
   * @default 1
   */
  multipv?: number
  /**
   * Stockfish `Skill Level` 0-20. Lower values intentionally weaken play to
   * simulate weaker opponents (used by the Companion mode opponent). Omit for
   * full-strength analysis (e.g. coach review, LLM-driven tools).
   * @default 20
   */
  skillLevel?: number
}

/**
 * A Stockfish engine handle that serialises analysis requests.
 */
export interface ChessEngine {
  /** Boots the engine: performs the `uci`/`isready` handshake. */
  init: () => Promise<void>
  /** Analyses one position. A newer call supersedes any in-flight one. */
  analyze: (fen: string, options?: AnalyzeOptions) => Promise<AnalysisResult>
  /** Tears down the engine and rejects any pending analysis. */
  dispose: () => void
}

/**
 * Rejection raised on an {@link ChessEngine.analyze} promise when a newer
 * request replaced it before it finished.
 *
 * Callers that fire one analysis per played move can safely ignore it — it only
 * means the user moved again before the previous analysis completed.
 */
export class AnalysisSupersededError extends Error {
  constructor() {
    super('Analysis superseded by a newer request.')
    this.name = 'AnalysisSupersededError'
  }
}

/** A pending analysis request together with its promise settlers. */
interface PendingRequest {
  fen: string
  depth: number
  multipv: number
  skillLevel: number
  resolve: (result: AnalysisResult) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout> | null
}

/** Stockfish's default `Skill Level` — full strength. */
const DEFAULT_SKILL_LEVEL = 20
/** Max time to wait for the UCI handshake before surfacing a boot error. */
const INIT_TIMEOUT_MS = 10_000
/** Max time to wait for one search before rejecting it and stopping the engine. */
const ANALYSIS_TIMEOUT_MS = 30_000

/**
 * Parses one Stockfish `info` line into the fields the coach needs.
 *
 * Before:
 * - "info depth 18 multipv 1 score cp 35 nodes 1000 pv e2e4 e7e5"
 *
 * After:
 * - `{ depth: 18, rank: 1, score: { cp: 35, mate: null }, pv: ['e2e4', 'e7e5'] }`
 *
 * Returns null for `info` lines without a usable score+pv (e.g. `currmove`
 * progress lines), so callers can skip them.
 */
function parseInfoLine(line: string): { depth: number, rank: number, score: EngineScore, pv: string[] } | null {
  const tokens = line.split(/\s+/)
  if (tokens[0] !== 'info')
    return null

  let depth: number | null = null
  let rank = 1
  let score: EngineScore | null = null
  let pv: string[] | null = null

  // UCI info lines are flat key/value streams; scan and pick the keys we use.
  for (let i = 1; i < tokens.length; i++) {
    const key = tokens[i]
    if (key === 'depth') {
      depth = Number(tokens[++i])
    }
    else if (key === 'multipv') {
      rank = Number(tokens[++i])
    }
    else if (key === 'score') {
      const kind = tokens[++i]
      const value = Number(tokens[++i])
      if (kind === 'cp')
        score = { cp: value, mate: null }
      else if (kind === 'mate')
        score = { cp: null, mate: value }
    }
    else if (key === 'pv') {
      // `pv` is always the final key; the rest of the line is the variation.
      pv = tokens.slice(i + 1)
      break
    }
  }

  if (depth === null || score === null || pv === null || pv.length === 0)
    return null
  return { depth, rank, score, pv }
}

/**
 * Extracts the move from a `bestmove` line, or null when the engine reports no
 * move (`bestmove (none)` in a terminal position).
 */
function parseBestMove(line: string): string | null {
  const tokens = line.split(/\s+/)
  if (tokens[0] !== 'bestmove')
    return null
  const move = tokens[1]
  if (!move || move === '(none)')
    return null
  return move
}

/**
 * Creates a Stockfish-backed {@link ChessEngine} over a {@link UciTransport}.
 *
 * Use when:
 * - The gamelet needs position analysis and move evaluation
 * - A test needs the engine logic without a real Worker (inject a fake transport)
 *
 * Expects:
 * - `transport` delivers UCI output lines one per `onLine` callback
 * - {@link ChessEngine.init} is awaited before {@link ChessEngine.analyze}
 *
 * Returns:
 * - A handle whose `analyze` serialises requests through a UCI state machine
 *   (`idle -> searching -> stopping -> idle`), so concurrent calls never race;
 *   the latest request wins and earlier ones reject with
 *   {@link AnalysisSupersededError}.
 */
export function createStockfishEngine(transport: UciTransport): ChessEngine {
  type State = 'uninitialized' | 'idle' | 'searching' | 'stopping'
  let state: State = 'uninitialized'

  let resolveInit: (() => void) | null = null
  let rejectInit: ((error: Error) => void) | null = null
  let initTimeout: ReturnType<typeof setTimeout> | null = null

  // Single-slot request model: `active` is the only request that matters. A new
  // analyze() rejects whatever was here and takes the slot — the latest wins.
  let active: PendingRequest | null = null

  // Best `info` line seen per MultiPV rank for the in-flight search.
  let lines = new Map<number, EngineLine>()
  // MultiPV value the engine is currently configured with (Stockfish default 1).
  let currentMultipv = 1
  // Skill Level the engine is currently configured with (Stockfish default 20).
  let currentSkillLevel = DEFAULT_SKILL_LEVEL

  function clearInitTimeout(): void {
    if (initTimeout) {
      clearTimeout(initTimeout)
      initTimeout = null
    }
  }

  function settleInitError(error: Error): void {
    clearInitTimeout()
    const reject = rejectInit
    resolveInit = null
    rejectInit = null
    reject?.(error)
  }

  function clearRequestTimeout(request: PendingRequest | null): void {
    if (request?.timeout) {
      clearTimeout(request.timeout)
      request.timeout = null
    }
  }

  function assembleResult(fen: string, bestMoveToken: string | null): AnalysisResult {
    const sorted = [...lines.values()].sort((a, b) => a.rank - b.rank)
    const depth = sorted.reduce((max, line) => Math.max(max, line.depth), 0)
    return {
      fen,
      depth,
      lines: sorted,
      bestMove: bestMoveToken ?? sorted[0]?.pv[0] ?? '',
    }
  }

  function beginSearch(request: PendingRequest): void {
    lines = new Map()
    if (request.multipv !== currentMultipv) {
      transport.send(`setoption name MultiPV value ${request.multipv}`)
      currentMultipv = request.multipv
    }
    if (request.skillLevel !== currentSkillLevel) {
      transport.send(`setoption name Skill Level value ${request.skillLevel}`)
      currentSkillLevel = request.skillLevel
    }
    transport.send(`position fen ${request.fen}`)
    transport.send(`go depth ${request.depth}`)
    state = 'searching'
  }

  function onSearchEnd(bestMoveToken: string | null): void {
    if (state === 'searching') {
      const request = active
      state = 'idle'
      active = null
      clearRequestTimeout(request)
      request?.resolve(assembleResult(request.fen, bestMoveToken))
      return
    }
    if (state === 'stopping') {
      // The abandoned search has flushed its `bestmove`; serve the latest request.
      state = 'idle'
      if (active)
        beginSearch(active)
    }
  }

  function handleLine(rawLine: string): void {
    const line = rawLine.trim()
    if (line === '')
      return

    if (state === 'uninitialized') {
      if (line === 'uciok') {
        transport.send('isready')
      }
      else if (line === 'readyok') {
        state = 'idle'
        clearInitTimeout()
        const resolve = resolveInit
        resolveInit = null
        rejectInit = null
        resolve?.()
      }
      return
    }

    if (line.startsWith('bestmove')) {
      onSearchEnd(parseBestMove(line))
      return
    }

    // Only accumulate evaluations for a live search; ignore stale lines that
    // arrive while stopping the previous one.
    if (state === 'searching') {
      const info = parseInfoLine(line)
      if (info) {
        const existing = lines.get(info.rank)
        if (!existing || info.depth >= existing.depth)
          lines.set(info.rank, { score: info.score, pv: info.pv, depth: info.depth, rank: info.rank })
      }
    }
  }

  const unsubscribe = transport.onLine(handleLine)

  function init(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      resolveInit = resolve
      rejectInit = reject
      clearInitTimeout()
      initTimeout = setTimeout(() => {
        if (state !== 'uninitialized')
          return
        settleInitError(new Error('Stockfish initialization timed out.'))
      }, INIT_TIMEOUT_MS)
      transport.send('uci')
    })
  }

  function analyze(fen: string, options?: AnalyzeOptions): Promise<AnalysisResult> {
    return new Promise<AnalysisResult>((resolve, reject) => {
      if (!safeParse(fenSchema, fen).success) {
        reject(new Error(`Malformed FEN: "${fen}"`))
        return
      }
      if (state === 'uninitialized') {
        reject(new Error('Engine not initialized; await init() first.'))
        return
      }

      const request: PendingRequest = {
        fen,
        depth: options?.depth ?? 15,
        multipv: options?.multipv ?? 1,
        skillLevel: options?.skillLevel ?? DEFAULT_SKILL_LEVEL,
        resolve,
        reject,
        timeout: null,
      }
      request.timeout = setTimeout(() => {
        if (active !== request)
          return
        active = null
        state = 'stopping'
        transport.send('stop')
        reject(new Error('Stockfish analysis timed out.'))
      }, ANALYSIS_TIMEOUT_MS)

      if (active) {
        clearRequestTimeout(active)
        active.reject(new AnalysisSupersededError())
      }
      active = request

      if (state === 'idle') {
        beginSearch(request)
      }
      else if (state === 'searching') {
        // Interrupt the running search; beginSearch(active) runs once it flushes.
        transport.send('stop')
        state = 'stopping'
      }
      // state === 'stopping': the in-flight stop will pick up `active` on `bestmove`.
    })
  }

  function dispose(): void {
    clearInitTimeout()
    if (rejectInit) {
      rejectInit(new Error('Engine disposed.'))
      resolveInit = null
      rejectInit = null
    }
    unsubscribe()
    transport.terminate()
    if (active) {
      clearRequestTimeout(active)
      active.reject(new Error('Engine disposed.'))
      active = null
    }
  }

  return { init, analyze, dispose }
}
