import type { MotionCatalogEntry, MotionIntent, SchedulerEvent } from '@proj-airi/alice-motion'

import { fullBodyChannels, MotionCatalog, MotionDirector, MotionScheduler } from '@proj-airi/alice-motion'

/** An emote of the stage, as the VRM motion library lists it. */
export interface StageEmote {
  id: string
  name: string
  description: string
}

export interface StageMotionHooks {
  /** Plays a clip of the renderer. Resolves `false` when the renderer has no such clip. */
  playClip: (clipId: string) => Promise<boolean>
  /** Diagnostic line for each clip that starts or has no renderer clip. */
  log?: (message: string) => void
}

/** What the runtime did, for the bridge settings page and for tests. */
export interface StageMotionStats {
  started: number
  refused: number
  /** Cues of procedural generators. The VRM renders its own procedural motion, so they only hold channels. */
  generatorCues: number
  missingClips: number
  lastRefusal?: string
  lastMissingClip?: string
}

/**
 * Clips that the VRM motion library has under another name.
 * NOTICE:
 * The VRM library has no clip for most NeoAlice gestures yet (see `defaultMotionCatalogEntries`).
 * These are the nearest bundled emotes: the greeting waves with both hands, and shoot points the index finger.
 * Source: `packages/stage-ui-three/src/assets/vrm/animations/index.ts`.
 * Removal condition: the VRM library gets its own wave and pointing clips (sprint V5).
 */
const vrmClipAliases: Record<string, string> = {
  wave_left: 'greeting',
  wave_right: 'greeting',
  index: 'shoot',
}

/** Lower snake case of an emote name, the form of a semantic action. */
function actionOf(emote: StageEmote) {
  const action = emote.name.trim().toLowerCase().replace(/[\s\-_]+/g, '_')
  return /^[a-z][a-z0-9_]{0,63}$/.test(action) ? action : undefined
}

/**
 * Motion runtime of the stage: the director (S03) and the scheduler (S04) on the stage clock.
 *
 * It receives conversation events and motion intents, for example from the NeoAlice bridge (S08),
 * arbitrates them, and plays the clip cues on the renderer. Call `tick` from a timer with a monotonic clock.
 */
export class StageMotionRuntime {
  readonly director: MotionDirector
  readonly scheduler: MotionScheduler
  readonly stats: StageMotionStats = { started: 0, refused: 0, generatorCues: 0, missingClips: 0 }
  private catalog = new MotionCatalog()

  constructor(private readonly hooks: StageMotionHooks, options: { seed?: number } = {}) {
    this.director = new MotionDirector({ seed: options.seed ?? Date.now() % 2_147_483_647, catalog: this.catalog, idPrefix: 'stage' })
    this.scheduler = new MotionScheduler({ catalog: this.catalog })
  }

  /** Adds the emotes that the default catalog does not know, for example imported VRMA files. */
  setEmotes(emotes: readonly StageEmote[]) {
    const base = new MotionCatalog()
    const extra: MotionCatalogEntry[] = []
    for (const emote of emotes) {
      const action = actionOf(emote)
      if (!action || base.get(action) || extra.some(entry => entry.semanticAction === action))
        continue
      extra.push({
        semanticAction: action,
        clipId: emote.id,
        channels: fullBodyChannels,
        durationMs: 3000,
        priority: 60,
        interruptible: true,
        fadeInMs: 200,
        fadeOutMs: 300,
        mode: 'normal',
        maxWeight: 1,
        description: emote.description.slice(0, 200),
      })
    }
    this.catalog = base.extend(extra)
    this.director.setCatalog(this.catalog)
    this.scheduler.setCatalog(this.catalog)
  }

  /** Every semantic action that the runtime accepts. */
  get actions() {
    return this.catalog.actions
  }

  /** Schedules an intent from outside, for example a NeoAlice gesture. */
  submit(intent: MotionIntent, nowMs: number) {
    const result = this.scheduler.submit(intent, nowMs)
    if (!result.ok) {
      this.stats.refused++
      this.stats.lastRefusal = `${intent.semanticAction}: ${result.reason}`
    }
    return result
  }

  speechStarted(sessionId: string, nowMs: number) {
    this.director.speechStarted(sessionId, nowMs)
    this.scheduler.speechStarted(sessionId, nowMs)
  }

  speechEnded(sessionId: string, nowMs: number) {
    this.director.speechEnded(sessionId, nowMs)
  }

  /** Cancels a session now, for example after `cmd/tts/stop` or a reconnection. */
  cancelSession(sessionId: string, nowMs: number) {
    this.scheduler.cancelSession(sessionId, nowMs)
  }

  /** Advances the director and the scheduler, and plays the cues that start. */
  async tick(nowMs: number) {
    const output = this.director.update(nowMs)
    for (const sessionId of output.cancelledSessions)
      this.scheduler.cancelSession(sessionId, nowMs)
    for (const intent of output.intents) {
      // Director intents that lose a channel are normal arbitration, not errors. They are not counted.
      this.scheduler.submit(intent, nowMs)
    }
    await this.play(this.scheduler.update(nowMs))
  }

  private async play(events: SchedulerEvent[]) {
    for (const event of events) {
      if (event.type !== 'start')
        continue
      if (event.cue.generatorId) {
        this.stats.generatorCues++
        continue
      }
      const clipId = event.cue.clipId!
      this.stats.started++
      const rendererClip = vrmClipAliases[clipId] ?? clipId
      if (await this.hooks.playClip(rendererClip)) {
        this.hooks.log?.(`played ${event.semanticAction} as clip ${rendererClip}`)
      }
      else {
        this.stats.missingClips++
        this.stats.lastMissingClip = clipId
        this.hooks.log?.(`no renderer clip for ${event.semanticAction} (${clipId})`)
      }
    }
  }
}
