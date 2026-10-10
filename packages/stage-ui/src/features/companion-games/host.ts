import type { MotionIntent } from './motion-adapter'

export type GameKind = 'paper-toss' | 'catch-stars' | 'rock-paper-scissors' | 'copy-gesture' | 'hidden-star' | 'follow-me'
export type Hand = 'rock' | 'paper' | 'scissors'
export type Gesture = 'wave' | 'point' | 'bow'
export type PauseReason = 'user' | 'focus' | 'resize' | 'pointer' | 'ownership'
export interface Point { x: number, y: number }

/** Coordinates use fractions of the owned playfield, independent of pixel size. */
export interface PaperToss {
  kind: 'paper-toss'
  phase: 'aim' | 'flight' | 'result'
  basket: number
  angle: number
  power: number
  ball: Point | null
  flight: number
  throws: number
  hit: boolean | null
}
export interface CatchStars {
  kind: 'catch-stars'
  tray: number
  stars: (Point & { id: number })[]
  spawned: number
  resolved: number
  spawnIn: number
}
export interface RockPaperScissors {
  kind: 'rock-paper-scissors'
  phase: 'choose' | 'countdown' | 'result'
  player: Hand | null
  opponent: Hand | null
  rivalScore: number
  countdown: number
  history: { player: Hand, opponent: Hand, outcome: 'win' | 'draw' | 'loss' }[]
}
export interface CopyGesture {
  kind: 'copy-gesture'
  phase: 'show' | 'repeat' | 'result'
  cue: Gesture | null
  length: number
  shown: number
  entered: number
  countdown: number
  correct: boolean | null
}
export interface HiddenStar {
  kind: 'hidden-star'
  phase: 'reveal' | 'shuffle' | 'choose' | 'result'
  /** Cup identities remain stable when their positions change. */
  cups: number[]
  star: number | null
  swaps: [number, number][]
  countdown: number
  correct: boolean | null
  selected: number | null
}
export interface FollowMe {
  kind: 'follow-me'
  phase: 'follow' | 'result'
  path: Point[]
  marker: Point
  reached: number
}
export type GameData = PaperToss | CatchStars | RockPaperScissors | CopyGesture | HiddenStar | FollowMe

/** Only these phases need time updates. Choices and untimed practice stay idle. */
export function hasTimeline(data: GameData | null): boolean {
  return data?.kind === 'catch-stars'
    || (data?.kind === 'paper-toss' && data.phase === 'flight')
    || (data?.kind === 'copy-gesture' && data.phase === 'show')
    || (data?.kind === 'hidden-star' && (data.phase === 'reveal' || data.phase === 'shuffle'))
    || (data?.kind === 'rock-paper-scissors' && data.phase === 'countdown')
}

export interface GameOptions {
  seed: number
  /** Static, user-stepped timelines replace continuous movement. @default false */
  reducedMotion?: boolean
  /** Slower falling stars and longer gesture and cup previews. @default true */
  slow?: boolean
  /** Wider catch and follow targets. @default true */
  largeTargets?: boolean
}

/** Detached view of the current session. Hidden choices never enter this snapshot. */
export interface GameSnapshot {
  sessionId: number
  /** Capture this token when scheduling work. Lifecycle changes invalidate old ticks. */
  token: number
  status: 'idle' | 'playing' | 'paused' | 'finished'
  pauseReason: PauseReason | null
  seed: number
  score: number
  round: number
  elapsed: number
  options: Required<GameOptions>
  data: GameData | null
  motion: MotionIntent | null
}

const hands: Hand[] = ['rock', 'paper', 'scissors']
const gestures: Gesture[] = ['wave', 'point', 'bow']

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function inBounds(point: Point) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
}

/**
 * Owns one local session. It creates no timers, storage, network requests, or pointer listeners.
 * Start replaces a session. Pause freezes simulation. Stop removes all game props and pending cues.
 * The renderer supplies elapsed time with the current token and stops its clock when inactive.
 */
export class CompanionGameHost {
  private state: GameSnapshot = {
    sessionId: 0,
    token: 0,
    status: 'idle',
    pauseReason: null,
    seed: 1,
    score: 0,
    round: 1,
    elapsed: 0,
    options: { seed: 1, reducedMotion: false, slow: true, largeTargets: true },
    data: null,
    motion: null,
  }

  private randomState = 1
  private committedHand: Hand = 'rock'
  private sequence: Gesture[] = []
  private hiddenCup = 0
  private plannedSwaps: [number, number][] = []
  private motionRevision = 0
  private pendingTime = 0
  private disposed = false
  private viewport = { width: 0, height: 0 }

  get snapshot(): GameSnapshot {
    // Callers can inspect or retain this snapshot without changing the live session.
    return structuredClone(this.state)
  }

  start(kind: GameKind, options: GameOptions) {
    if (this.disposed)
      return
    const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) >>> 0 : 1
    this.state = {
      sessionId: this.state.sessionId + 1,
      token: this.state.token + 1,
      status: 'playing',
      pauseReason: null,
      seed,
      score: 0,
      round: 1,
      elapsed: 0,
      options: { seed, slow: options.slow ?? true, largeTargets: options.largeTargets ?? true, reducedMotion: options.reducedMotion ?? false },
      data: null,
      motion: null,
    }
    this.randomState = seed
    this.pendingTime = 0
    this.sequence = []
    this.plannedSwaps = []
    this.startRound(kind)
    if (this.viewport.width < 1 || this.viewport.height < 1)
      this.pause('resize')
  }

  pause(reason: PauseReason = 'user') {
    if (this.state.status !== 'playing')
      return
    this.state.status = 'paused'
    this.state.pauseReason = reason
    this.invalidate()
  }

  resume() {
    if (this.state.status !== 'paused' || this.disposed || this.viewport.width < 1 || this.viewport.height < 1)
      return
    this.state.status = 'playing'
    this.state.pauseReason = null
    this.invalidate()
    if (this.state.data?.kind === 'copy-gesture' && this.state.data.phase === 'show')
      this.replay()
  }

  stop() {
    this.invalidate()
    this.state.status = 'idle'
    this.state.pauseReason = null
    this.state.data = null
    this.sequence = []
    this.plannedSwaps = []
  }

  dispose() {
    this.stop()
    this.disposed = true
  }

  resize(width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0)
      return
    const changed = width !== this.viewport.width || height !== this.viewport.height
    this.viewport = { width, height }
    if (changed)
      this.pause('resize')
  }

  /** Background gaps are discarded. Repeated fixed substeps keep collisions deterministic. */
  advance(milliseconds: number, token: number) {
    if (this.state.options.reducedMotion || !Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 250)
      return
    this.advanceTimeline(milliseconds, token)
  }

  /** One accessible timeline step. No automatic motion runs in reduced-motion mode. */
  step(token: number) {
    if (this.state.options.reducedMotion)
      this.advanceTimeline(500, token)
  }

  aim(angle: number, power: number) {
    const data = this.state.data
    if (this.state.status !== 'playing' || data?.kind !== 'paper-toss' || data.phase !== 'aim' || !Number.isFinite(angle) || !Number.isFinite(power))
      return
    data.angle = clamp(angle, 15, 80)
    data.power = clamp(power, 0.3, 1)
  }

  throwPaper() {
    const data = this.state.data
    if (this.state.status !== 'playing' || data?.kind !== 'paper-toss' || data.phase !== 'aim')
      return
    data.phase = 'flight'
    data.flight = 0
    data.ball = { x: 0.12, y: 0.82 }
    this.pose('throw')
  }

  move(point: Point) {
    const data = this.state.data
    if (this.state.status !== 'playing' || !inBounds(point))
      return
    if (data?.kind === 'catch-stars') {
      const margin = this.state.options.largeTargets ? 0.15 : 0.1
      data.tray = clamp(point.x, margin, 1 - margin)
    }
    if (data?.kind === 'follow-me' && data.phase === 'follow') {
      data.marker = { ...point }
      const target = data.path[data.reached]
      const radius = this.state.options.largeTargets ? 0.12 : 0.08
      if (target && Math.hypot(point.x - target.x, point.y - target.y) <= radius) {
        data.reached++
        this.state.score++
        this.pose('point')
        if (data.reached === data.path.length) {
          data.phase = 'result'
          this.finish()
        }
      }
    }
  }

  moveBy(x: number, y: number) {
    const data = this.state.data
    if (!Number.isFinite(x) || !Number.isFinite(y))
      return
    const point = data?.kind === 'follow-me' ? data.marker : { x: data?.kind === 'catch-stars' ? data.tray : 0.5, y: 0.9 }
    this.move({ x: clamp(point.x + clamp(x, -0.1, 0.1), 0, 1), y: clamp(point.y + clamp(y, -0.1, 0.1), 0, 1) })
  }

  chooseHand(hand: Hand) {
    const data = this.state.data
    if (this.state.status !== 'playing' || data?.kind !== 'rock-paper-scissors' || data.phase !== 'choose' || !hands.includes(hand))
      return
    // The opponent choice was committed in startRound, before this input arrives.
    data.player = hand
    data.phase = 'countdown'
    data.countdown = 900
    this.pose('think')
  }

  chooseGesture(gesture: Gesture) {
    const data = this.state.data
    if (this.state.status !== 'playing' || data?.kind !== 'copy-gesture' || data.phase !== 'repeat' || !gestures.includes(gesture))
      return
    if (gesture !== this.sequence[data.entered]) {
      data.correct = false
      data.phase = 'result'
      this.pose('bow')
    }
    else {
      data.entered++
      if (data.entered === data.length) {
        data.correct = true
        data.phase = 'result'
        this.state.score++
        this.pose('celebrate')
      }
    }
    if (data.phase === 'result' && this.state.round === 3)
      this.finish()
  }

  replay() {
    const data = this.state.data
    if (this.state.status !== 'playing' || data?.kind !== 'copy-gesture' || data.phase === 'result')
      return
    this.invalidate()
    data.phase = 'show'
    data.shown = 0
    data.entered = 0
    data.cue = this.sequence[0]
    data.countdown = this.previewDuration()
    this.pose(data.cue)
  }

  chooseCup(position: number) {
    const data = this.state.data
    if (this.state.status !== 'playing' || data?.kind !== 'hidden-star' || data.phase !== 'choose' || !Number.isInteger(position) || position < 0 || position > 2)
      return
    data.selected = position
    data.star = this.hiddenCup
    data.correct = data.cups[position] === this.hiddenCup
    data.phase = 'result'
    if (data.correct)
      this.state.score++
    this.pose(data.correct ? 'celebrate' : 'bow')
    if (this.state.round === 3)
      this.finish()
  }

  nextRound() {
    const data = this.state.data
    if (this.state.status !== 'playing' || !data || !('phase' in data) || data.phase !== 'result')
      return
    this.state.round++
    this.invalidate()
    this.startRound(data.kind)
  }

  private invalidate() {
    this.state.token++
    this.pendingTime = 0
    this.state.motion = null
  }

  private random() {
    this.randomState = (this.randomState + 0x6D2B79F5) >>> 0
    let value = this.randomState
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }

  private pose(name: MotionIntent['name']) {
    this.state.motion = { sessionId: this.state.sessionId, revision: ++this.motionRevision, name }
  }

  private previewDuration() {
    return this.state.options.slow ? 1400 : 900
  }

  private startRound(kind: GameKind) {
    const previous = this.state.data
    switch (kind) {
      case 'paper-toss':
        this.state.data = { kind, phase: 'aim', basket: 0.55 + this.random() * 0.25, angle: 55, power: 0.85, ball: null, flight: 0, throws: this.state.round - 1, hit: null }
        break
      case 'catch-stars':
        this.state.data = { kind, tray: 0.5, stars: [], spawned: 0, resolved: 0, spawnIn: 0 }
        break
      case 'rock-paper-scissors':
        this.committedHand = hands[Math.floor(this.random() * hands.length)]
        this.state.data = { kind, phase: 'choose', player: null, opponent: null, countdown: 0, rivalScore: previous?.kind === kind ? previous.rivalScore : 0, history: previous?.kind === kind ? previous.history : [] }
        break
      case 'copy-gesture':
        this.sequence = Array.from({ length: this.state.round + 2 }, () => gestures[Math.floor(this.random() * gestures.length)])
        this.state.data = { kind, phase: 'show', cue: this.sequence[0], length: this.sequence.length, shown: 0, entered: 0, countdown: this.previewDuration(), correct: null }
        this.pose(this.sequence[0])
        break
      case 'hidden-star':
        this.hiddenCup = Math.floor(this.random() * 3)
        this.plannedSwaps = Array.from({ length: 3 }, () => {
          const first = Math.floor(this.random() * 3)
          return [first, (first + 1 + Math.floor(this.random() * 2)) % 3]
        })
        this.state.data = { kind, phase: 'reveal', cups: [0, 1, 2], star: this.hiddenCup, swaps: [], countdown: this.previewDuration(), correct: null, selected: null }
        break
      case 'follow-me':
        this.state.data = { kind, phase: 'follow', path: Array.from({ length: 6 }, () => ({ x: 0.15 + this.random() * 0.7, y: 0.18 + this.random() * 0.6 })), marker: { x: 0.5, y: 0.9 }, reached: 0 }
        break
    }
  }

  private advanceTimeline(milliseconds: number, token: number) {
    if (token !== this.state.token || this.state.status !== 'playing' || !hasTimeline(this.state.data))
      return
    this.pendingTime += milliseconds
    while (this.pendingTime >= 20 && this.state.status === 'playing' && hasTimeline(this.state.data)) {
      this.pendingTime -= 20
      this.state.elapsed += 20
      this.tick(20)
    }
  }

  private tick(delta: number) {
    const data = this.state.data
    if (!data)
      return
    switch (data.kind) {
      case 'paper-toss':
        this.tickPaper(data, delta)
        break
      case 'catch-stars':
        this.tickStars(data, delta)
        break
      case 'rock-paper-scissors':
        if (data.phase !== 'countdown')
          break
        data.countdown -= delta
        if (data.countdown <= 0) {
          data.opponent = this.committedHand
          const player = data.player!
          const outcome = player === data.opponent ? 'draw' : (hands.indexOf(player) - hands.indexOf(data.opponent) + 3) % 3 === 1 ? 'win' : 'loss'
          data.history.push({ player, opponent: data.opponent, outcome })
          data.phase = 'result'
          this.state.score += Number(outcome === 'win')
          data.rivalScore += Number(outcome === 'loss')
          this.pose(data.opponent)
          // Nine draws cap one session without changing the best-of-three win rule.
          if (this.state.score === 2 || data.rivalScore === 2 || data.history.length === 9)
            this.finish()
        }
        break
      case 'copy-gesture':
        if (data.phase !== 'show')
          break
        data.countdown -= delta
        if (data.countdown <= 0) {
          data.shown++
          data.cue = this.sequence[data.shown] ?? null
          data.countdown = this.previewDuration()
          if (data.cue) {
            this.pose(data.cue)
          }
          else {
            data.phase = 'repeat'
            this.state.motion = null
          }
        }
        break
      case 'hidden-star':
        if (data.phase !== 'reveal' && data.phase !== 'shuffle')
          break
        data.countdown -= delta
        if (data.countdown <= 0) {
          data.star = null
          const swap = this.plannedSwaps[data.swaps.length]
          if (swap) {
            const [first, second] = swap
            ;[data.cups[first], data.cups[second]] = [data.cups[second], data.cups[first]]
            data.swaps.push(swap)
            data.phase = 'shuffle'
            data.countdown = this.previewDuration()
          }
          else {
            data.phase = 'choose'
          }
        }
        break
    }
  }

  private tickPaper(data: PaperToss, delta: number) {
    if (data.phase !== 'flight' || !data.ball)
      return
    const previous = data.ball
    data.flight += delta / 1000
    const angle = data.angle * Math.PI / 180
    const x = 0.12 + Math.cos(angle) * data.power * data.flight * 1.3
    const y = 0.82 - Math.sin(angle) * data.power * data.flight * 1.3 + 0.65 * data.flight ** 2
    data.ball = { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
    // Interpolate the descending rim crossing to avoid tunneling between frame samples.
    if (previous.y < 0.72 && y >= 0.72) {
      const crossingX = previous.x + (x - previous.x) * ((0.72 - previous.y) / (y - previous.y))
      if (Math.abs(crossingX - data.basket) <= 0.075) {
        this.endThrow(data, true)
        return
      }
    }
    if (y >= 0.94 || x > 0.99 || data.flight >= 3)
      this.endThrow(data, false)
  }

  private endThrow(data: PaperToss, hit: boolean) {
    data.phase = 'result'
    data.hit = hit
    data.throws++
    data.ball = null
    this.state.score += Number(hit)
    this.pose(hit ? 'celebrate' : 'bow')
    if (data.throws === 3)
      this.finish()
  }

  private tickStars(data: CatchStars, delta: number) {
    data.spawnIn -= delta
    if (data.spawned < 12 && data.spawnIn <= 0) {
      data.stars.push({ id: data.spawned++, x: 0.13 + this.random() * 0.74, y: 0.06 })
      data.spawnIn += this.state.options.slow ? 1800 : 1200
    }
    const speed = this.state.options.slow ? 0.18 : 0.28
    const width = this.state.options.largeTargets ? 0.15 : 0.1
    data.stars = data.stars.filter((star) => {
      const previousY = star.y
      star.y += delta / 1000 * speed
      if (previousY < 0.84 && star.y >= 0.84 && Math.abs(star.x - data.tray) <= width) {
        this.state.score++
        data.resolved++
        this.pose('catch')
        return false
      }
      if (star.y >= 0.98) {
        data.resolved++
        return false
      }
      return true
    })
    if (data.resolved === 12)
      this.finish()
  }

  private finish() {
    this.state.status = 'finished'
    this.invalidate()
  }
}
