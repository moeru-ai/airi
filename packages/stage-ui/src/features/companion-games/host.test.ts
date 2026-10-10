import type { GameKind, Gesture, Hand } from './host'

import { describe, expect, it } from 'vitest'

import { CompanionGameHost } from './host'

const games: GameKind[] = ['paper-toss', 'catch-stars', 'rock-paper-scissors', 'copy-gesture', 'hidden-star', 'follow-me']

function start(kind: GameKind, seed = 14) {
  const host = new CompanionGameHost()
  host.resize(800, 450)
  host.start(kind, { seed })
  return host
}

function advance(host: CompanionGameHost, milliseconds: number) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 100)
    host.advance(Math.min(100, milliseconds - elapsed), host.snapshot.token)
}

function showSequence(host: CompanionGameHost) {
  const sequence: Gesture[] = []
  let lastRevision = -1
  for (let frame = 0; frame < 100; frame++) {
    const snapshot = host.snapshot
    const data = snapshot.data
    if (data?.kind !== 'copy-gesture' || data.phase !== 'show')
      break
    if (data.cue && snapshot.motion && snapshot.motion.revision !== lastRevision) {
      sequence.push(data.cue)
      lastRevision = snapshot.motion.revision
    }
    advance(host, 100)
  }
  return sequence
}

describe('companion game lifecycle', () => {
  it.each(games)('replays %s deterministically from a seed', (game) => {
    const first = start(game)
    const second = start(game)
    advance(first, 2000)
    advance(second, 2000)
    expect(first.snapshot).toEqual(second.snapshot)
    expect(start(game, 45).snapshot.seed).not.toBe(first.snapshot.seed)
  })

  it.each(games)('freezes %s and rejects stale ticks after pause and restart', (game) => {
    const host = start(game)
    const token = host.snapshot.token
    advance(host, 300)
    host.pause('focus')
    const paused = host.snapshot
    advance(host, 500)
    expect(host.snapshot).toEqual(paused)
    expect(paused.motion).toBeNull()
    host.resume()
    const resumed = host.snapshot
    host.advance(100, token)
    expect(host.snapshot).toEqual(resumed)
    host.start(game, { seed: 9 })
    const restarted = host.snapshot
    host.advance(100, resumed.token)
    expect(host.snapshot).toEqual(restarted)
  })

  it.each(games)('stops %s without props or retained work', (game) => {
    const host = start(game)
    for (let restart = 0; restart < 10; restart++)
      host.start(game, { seed: restart })
    host.stop()
    expect(host.snapshot.data).toBeNull()
    expect(host.snapshot.motion).toBeNull()
    expect(host.snapshot.status).toBe('idle')
    host.dispose()
    host.start(game, { seed: 123 })
    expect(host.snapshot.status).toBe('idle')
  })

  it('pauses on resize and refuses resume without a visible playfield', () => {
    const host = start('follow-me')
    const before = host.snapshot.data
    host.resize(320, 200)
    expect(host.snapshot.pauseReason).toBe('resize')
    expect(host.snapshot.data).toEqual(before)
    host.resize(0, 0)
    host.resume()
    expect(host.snapshot.status).toBe('paused')
    host.resize(600, 300)
    host.resume()
    expect(host.snapshot.status).toBe('playing')
  })

  it('rejects invalid deltas and keeps snapshots detached', () => {
    const host = start('catch-stars')
    const initial = host.snapshot
    for (const delta of [-1, Number.NaN, Number.POSITIVE_INFINITY, 251, 90000])
      host.advance(delta, initial.token)
    expect(host.snapshot).toEqual(initial)
    initial.score = 999
    expect(host.snapshot.score).toBe(0)
  })

  it.each(games)('keeps %s independent of frame partitioning', (kind) => {
    const first = start(kind)
    const second = start(kind)
    if (kind === 'paper-toss') {
      first.throwPaper()
      second.throwPaper()
    }
    advance(first, 2000)
    for (let frame = 0; frame < 125; frame++)
      second.advance(16, second.snapshot.token)
    expect(second.snapshot).toEqual(first.snapshot)
  })

  it('pauses a start without a visible playfield', () => {
    const host = new CompanionGameHost()
    host.start('catch-stars', { seed: 1 })
    expect(host.snapshot.status).toBe('paused')
    expect(host.snapshot.pauseReason).toBe('resize')
  })

  it('requires explicit steps in reduced-motion mode', () => {
    const host = start('catch-stars')
    host.start('catch-stars', { seed: 1, reducedMotion: true })
    advance(host, 1000)
    expect(host.snapshot.elapsed).toBe(0)
    host.step(host.snapshot.token)
    expect(host.snapshot.elapsed).toBe(500)
    host.pause()
    host.step(host.snapshot.token)
    expect(host.snapshot.elapsed).toBe(500)
  })
})

describe('paper toss', () => {
  it('scores three deterministic basket crossings and then stops', () => {
    const host = start('paper-toss')
    for (let round = 0; round < 3; round++) {
      const data = host.snapshot.data
      if (data?.kind !== 'paper-toss')
        throw new Error('Expected paper toss')
      const angle = 55 * Math.PI / 180
      const distance = data.basket - 0.12
      const power = Math.sqrt(0.65 * distance ** 2 / (Math.cos(angle) ** 2 * (Math.tan(angle) * distance - 0.1))) / 1.3
      host.aim(55, power)
      host.throwPaper()
      host.throwPaper()
      advance(host, 3000)
      expect(host.snapshot.score).toBe(round + 1)
      expect(host.snapshot.data).toMatchObject({ phase: 'result', hit: true, ball: null })
      host.nextRound()
    }
    expect(host.snapshot.status).toBe('finished')
    expect(host.snapshot.round).toBe(3)
  })

  it('bounds aiming and scores misses only once', () => {
    const host = start('paper-toss')
    host.aim(1000, -3)
    expect(host.snapshot.data).toMatchObject({ angle: 80, power: 0.3 })
    host.aim(Number.NaN, 1)
    expect(host.snapshot.data).toMatchObject({ angle: 80, power: 0.3 })
    host.throwPaper()
    advance(host, 6000)
    expect(host.snapshot.score).toBe(0)
    expect(host.snapshot.data).toMatchObject({ throws: 1, hit: false, ball: null })
  })
})

describe('catch stars', () => {
  it('catches all twelve stars with bounded input and stops scoring', () => {
    const host = start('catch-stars')
    for (let frame = 0; frame < 400; frame++) {
      const data = host.snapshot.data
      if (data?.kind !== 'catch-stars')
        throw new Error('Expected catch stars')
      const next = data.stars[0]
      if (next)
        host.move({ x: next.x, y: 0.9 })
      advance(host, 100)
    }
    expect(host.snapshot.status).toBe('finished')
    expect(host.snapshot.score).toBe(12)
    expect(host.snapshot.data).toMatchObject({ spawned: 12, resolved: 12, stars: [] })
  })

  it('lets missed stars leave the playfield and rejects outside coordinates', () => {
    const host = start('catch-stars')
    for (const x of [-1, 2, Number.NaN, Number.POSITIVE_INFINITY])
      host.move({ x, y: 0.9 })
    expect(host.snapshot.data).toMatchObject({ tray: 0.5 })
    host.moveBy(-100, 0)
    expect(host.snapshot.data).toMatchObject({ tray: 0.4 })
    advance(host, 40000)
    expect(host.snapshot.status).toBe('finished')
    expect(host.snapshot.data).toMatchObject({ resolved: 12, stars: [] })
  })
})

describe('rock paper scissors', () => {
  it('commits its choice before input and ignores duplicate choices', () => {
    const first = start('rock-paper-scissors')
    const second = start('rock-paper-scissors')
    expect(first.snapshot.data).toMatchObject({ opponent: null })
    first.chooseHand('rock')
    first.chooseHand('scissors')
    second.chooseHand('paper')
    expect(first.snapshot.data).toMatchObject({ player: 'rock', opponent: null })
    advance(first, 900)
    advance(second, 900)
    const firstData = first.snapshot.data
    const secondData = second.snapshot.data
    if (firstData?.kind !== 'rock-paper-scissors' || secondData?.kind !== 'rock-paper-scissors')
      throw new Error('Expected hands')
    expect(firstData.opponent).toBe(secondData.opponent)
    expect(firstData.history).toHaveLength(1)
  })

  it.each<Hand>(['rock', 'paper', 'scissors'])('scores every opponent outcome for %s', (player) => {
    const seen = new Set<Hand>()
    for (let seed = 0; seed < 30; seed++) {
      const host = start('rock-paper-scissors', seed)
      host.chooseHand(player)
      advance(host, 900)
      const data = host.snapshot.data
      if (data?.kind !== 'rock-paper-scissors' || !data.opponent)
        throw new Error('Expected revealed hand')
      seen.add(data.opponent)
      const wins = { rock: 'scissors', paper: 'rock', scissors: 'paper' }
      expect(data.history[0].outcome).toBe(player === data.opponent ? 'draw' : wins[player] === data.opponent ? 'win' : 'loss')
    }
    expect(seen.size).toBe(3)
  })

  it('finishes at two decisive wins and bounds history', () => {
    const host = start('rock-paper-scissors')
    for (let round = 0; round < 30; round++) {
      host.chooseHand('rock')
      advance(host, 900)
      host.nextRound()
    }
    const data = host.snapshot.data
    if (data?.kind !== 'rock-paper-scissors')
      throw new Error('Expected hands')
    expect(host.snapshot.status).toBe('finished')
    expect(data.history.length).toBeLessThanOrEqual(9)
    expect(Math.max(host.snapshot.score, data.rivalScore)).toBeLessThanOrEqual(2)
  })
})

describe('copy the gesture', () => {
  it('plays three growing sequences with untimed response controls', () => {
    const host = start('copy-gesture')
    for (let round = 1; round <= 3; round++) {
      const sequence = showSequence(host)
      expect(sequence).toHaveLength(round + 2)
      expect(host.snapshot.data).toMatchObject({ phase: 'repeat', cue: null })
      advance(host, 20000)
      for (const gesture of sequence)
        host.chooseGesture(gesture)
      expect(host.snapshot.score).toBe(round)
      host.nextRound()
    }
    expect(host.snapshot.status).toBe('finished')
  })

  it('replay and pause invalidate prior cues and input', () => {
    const host = start('copy-gesture')
    const sequence = showSequence(host)
    host.chooseGesture(sequence[0])
    const oldToken = host.snapshot.token
    host.replay()
    expect(host.snapshot.data).toMatchObject({ phase: 'show', entered: 0, cue: sequence[0] })
    host.advance(200, oldToken)
    expect(host.snapshot.data).toMatchObject({ shown: 0 })
    advance(host, 1400)
    host.pause()
    expect(host.snapshot.motion).toBeNull()
    host.resume()
    expect(host.snapshot.data).toMatchObject({ shown: 0, cue: sequence[0] })
    expect(showSequence(host)).toEqual(sequence)
    host.chooseGesture(sequence[0] === 'wave' ? 'bow' : 'wave')
    expect(host.snapshot.data).toMatchObject({ phase: 'result', correct: false })
    expect(host.snapshot.score).toBe(0)
  })
})

describe('hidden star', () => {
  it('keeps the star attached to its cup across shuffles and resize', () => {
    const host = start('hidden-star')
    for (let round = 1; round <= 3; round++) {
      const initial = host.snapshot.data
      if (initial?.kind !== 'hidden-star')
        throw new Error('Expected cups')
      const star = initial.star
      advance(host, 2800)
      host.resize(300 + round, 200)
      const paused = host.snapshot.data
      expect(paused).toMatchObject({ star: null, phase: 'shuffle' })
      host.resume()
      advance(host, 4000)
      const data = host.snapshot.data
      if (data?.kind !== 'hidden-star')
        throw new Error('Expected cups')
      expect(data.phase).toBe('choose')
      expect(data.swaps).toHaveLength(3)
      expect(new Set(data.cups).size).toBe(3)
      host.chooseCup(data.cups.indexOf(star!))
      host.chooseCup(0)
      expect(host.snapshot.score).toBe(round)
      host.nextRound()
    }
    expect(host.snapshot.status).toBe('finished')
  })

  it('rejects early, fractional, and outside guesses', () => {
    const host = start('hidden-star')
    host.chooseCup(0)
    expect(host.snapshot.data).toMatchObject({ phase: 'reveal' })
    advance(host, 6000)
    for (const choice of [-1, 3, 0.5, Number.NaN])
      host.chooseCup(choice)
    expect(host.snapshot.data).toMatchObject({ phase: 'choose', selected: null })
  })
})

describe('follow me', () => {
  it('reaches six ordered targets through local coordinates', () => {
    const host = start('follow-me')
    const data = host.snapshot.data
    if (data?.kind !== 'follow-me')
      throw new Error('Expected path')
    for (const point of data.path)
      host.move(point)
    expect(host.snapshot.score).toBe(6)
    expect(host.snapshot.status).toBe('finished')
    host.move(data.path[0])
    expect(host.snapshot.score).toBe(6)
  })

  it('freezes when the pointer leaves and supports bounded keyboard movement', () => {
    const host = start('follow-me')
    host.moveBy(0.1, -0.1)
    expect(host.snapshot.data).toMatchObject({ marker: { x: 0.6, y: 0.8 } })
    host.pause('pointer')
    const paused = host.snapshot
    host.move({ x: 0.2, y: 0.2 })
    host.moveBy(0.1, 0.1)
    expect(host.snapshot).toEqual(paused)
    host.resume()
    host.move({ x: -1, y: 0.2 })
    expect(host.snapshot.data).toMatchObject({ marker: { x: 0.6, y: 0.8 } })
  })
})
