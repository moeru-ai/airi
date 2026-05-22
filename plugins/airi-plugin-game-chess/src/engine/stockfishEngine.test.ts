import type { UciTransport } from './stockfishEngine'

import { describe, expect, it, vi } from 'vitest'

import { AnalysisSupersededError, createStockfishEngine } from './stockfishEngine'

/** Standard chess starting position. */
const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
/** Position after 1.e4 — used as a distinct second position in supersede tests. */
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

/**
 * Builds an in-memory {@link UciTransport} that records sent commands and lets
 * the test replay engine output lines on demand.
 */
function createFakeTransport() {
  const sent: string[] = []
  let listener: ((line: string) => void) | null = null
  const transport: UciTransport = {
    send: command => sent.push(command),
    onLine: (l) => {
      listener = l
      return () => {
        listener = null
      }
    },
    terminate: () => {},
  }
  return { transport, sent, emit: (line: string) => listener?.(line) }
}

/** Creates an engine and drives it through the init handshake to `idle`. */
async function createReadyEngine() {
  const fake = createFakeTransport()
  const engine = createStockfishEngine(fake.transport)
  const ready = engine.init()
  fake.emit('uciok')
  fake.emit('readyok')
  await ready
  return { engine, fake }
}

/**
 * @example
 * const engine = createStockfishEngine(transport)
 * await engine.init()
 */
describe('createStockfishEngine', () => {
  /**
   * @example
   * expect(fake.sent).toContain('uci')
   */
  it('completes the uci/isready handshake on init', async () => {
    const fake = createFakeTransport()
    const engine = createStockfishEngine(fake.transport)

    const ready = engine.init()
    expect(fake.sent).toContain('uci')

    fake.emit('uciok')
    expect(fake.sent).toContain('isready')

    fake.emit('readyok')
    await expect(ready).resolves.toBeUndefined()
  })

  /**
   * @example
   * expect((await engine.analyze(STARTPOS)).bestMove).toBe('e2e4')
   */
  it('analyzes a position and returns the deepest line', async () => {
    const { engine, fake } = await createReadyEngine()

    const analysis = engine.analyze(STARTPOS, { depth: 12 })
    expect(fake.sent).toContain(`position fen ${STARTPOS}`)
    expect(fake.sent).toContain('go depth 12')

    fake.emit('info depth 10 multipv 1 score cp 20 pv e2e4 e7e5')
    fake.emit('info depth 12 multipv 1 score cp 31 pv e2e4 e7e5 g1f3')
    fake.emit('bestmove e2e4 ponder e7e5')

    const result = await analysis
    expect(result.bestMove).toBe('e2e4')
    expect(result.depth).toBe(12)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].score.cp).toBe(31)
    expect(result.lines[0].pv).toEqual(['e2e4', 'e7e5', 'g1f3'])
  })

  /**
   * @example
   * expect((await engine.analyze(STARTPOS, { multipv: 3 })).lines).toHaveLength(3)
   */
  it('requests MultiPV and returns ranked lines sorted best-first', async () => {
    const { engine, fake } = await createReadyEngine()

    const analysis = engine.analyze(STARTPOS, { depth: 12, multipv: 3 })
    expect(fake.sent).toContain('setoption name MultiPV value 3')

    // Emit ranks out of order to prove the result is sorted by rank.
    fake.emit('info depth 12 multipv 2 score cp 10 pv d2d4 d7d5')
    fake.emit('info depth 12 multipv 1 score cp 31 pv e2e4 e7e5')
    fake.emit('info depth 12 multipv 3 score cp 5 pv g1f3 g8f6')
    fake.emit('bestmove e2e4')

    const result = await analysis
    expect(result.lines.map(line => line.rank)).toEqual([1, 2, 3])
    expect(result.lines[0].pv[0]).toBe('e2e4')
  })

  /**
   * @example
   * await expect(firstAnalysis).rejects.toBeInstanceOf(AnalysisSupersededError)
   */
  it('supersedes an in-flight analysis when a newer one arrives', async () => {
    const { engine, fake } = await createReadyEngine()

    const first = engine.analyze(STARTPOS, { depth: 20 })
    const second = engine.analyze(AFTER_E4, { depth: 20 })

    await expect(first).rejects.toBeInstanceOf(AnalysisSupersededError)
    expect(fake.sent).toContain('stop')

    // The interrupted first search flushes its bestmove, then the second runs.
    fake.emit('bestmove e2e4')
    expect(fake.sent).toContain(`position fen ${AFTER_E4}`)

    fake.emit('info depth 20 multipv 1 score cp -25 pv e7e5')
    fake.emit('bestmove e7e5')
    await expect(second).resolves.toMatchObject({ bestMove: 'e7e5' })
  })

  /**
   * @example
   * // 50 rapid requests: only the last resolves, the engine never deadlocks.
   */
  it('handles a burst of rapid requests without deadlocking', async () => {
    const { engine, fake } = await createReadyEngine()

    const burst = Array.from({ length: 50 }, () => engine.analyze(STARTPOS, { depth: 18 }))
    for (const superseded of burst.slice(0, -1))
      await expect(superseded).rejects.toBeInstanceOf(AnalysisSupersededError)

    // One stop was issued for the very first search; flush it, then the last runs.
    fake.emit('bestmove e2e4')
    fake.emit('info depth 18 multipv 1 score cp 28 pv e2e4')
    fake.emit('bestmove e2e4')
    await expect(burst[burst.length - 1]).resolves.toMatchObject({ bestMove: 'e2e4' })
  })

  /**
   * @example
   * expect(result.lines[0].score.mate).toBe(3)
   */
  it('parses a forced-mate score', async () => {
    const { engine, fake } = await createReadyEngine()

    const analysis = engine.analyze(STARTPOS, { depth: 12 })
    fake.emit('info depth 12 multipv 1 score mate 3 pv e2e4 e7e5 d1h5')
    fake.emit('bestmove e2e4')

    const result = await analysis
    expect(result.lines[0].score.mate).toBe(3)
    expect(result.lines[0].score.cp).toBeNull()
  })

  /**
   * @example
   * await expect(engine.analyze('not a fen')).rejects.toThrow(/Malformed FEN/)
   */
  it('rejects a malformed FEN before sending anything', async () => {
    const { engine } = await createReadyEngine()
    await expect(engine.analyze('not a fen')).rejects.toThrow(/Malformed FEN/)
  })

  /**
   * @example
   * await expect(engine.init()).rejects.toThrow(/timed out/)
   */
  it('rejects init when the UCI handshake stalls', async () => {
    vi.useFakeTimers()
    try {
      const fake = createFakeTransport()
      const engine = createStockfishEngine(fake.transport)

      const ready = engine.init()
      vi.advanceTimersByTime(10_000)

      await expect(ready).rejects.toThrow(/initialization timed out/)
    }
    finally {
      vi.useRealTimers()
    }
  })

  /**
   * @example
   * await expect(engine.analyze(STARTPOS)).rejects.toThrow(/timed out/)
   */
  it('rejects and stops the engine when analysis stalls', async () => {
    const { engine, fake } = await createReadyEngine()
    vi.useFakeTimers()
    try {
      const analysis = engine.analyze(STARTPOS, { depth: 12 })
      vi.advanceTimersByTime(30_000)

      expect(fake.sent).toContain('stop')
      await expect(analysis).rejects.toThrow(/analysis timed out/)
    }
    finally {
      vi.useRealTimers()
    }
  })
})
