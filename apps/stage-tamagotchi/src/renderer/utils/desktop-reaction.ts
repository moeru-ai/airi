import type { DesktopReactionIntent } from '../../shared/desktop-companion'

/** The future motion host must provide current ownership. Missing ownership never authorizes a reaction. */
export interface DesktopReactionContext {
  modelId: string | undefined
  waveAvailable: boolean
  motionOwner: 'idle' | 'manual' | 'assistant' | 'unknown'
  paused: boolean
  doNotDisturb: boolean
  reducedMotion: boolean
  enabled: boolean
}

/**
 * Consumes each short-lived intent once. This gate has no bus connection until the motion host exposes ownership.
 * A rejected busy intent expires immediately rather than interrupting or queueing behind a manual motion.
 */
export class DesktopReactionGate {
  private readonly seen = new Set<string>()

  consume(intent: DesktopReactionIntent, context: DesktopReactionContext, now: number) {
    if (this.seen.has(intent.requestId))
      return null
    this.seen.add(intent.requestId)
    if (this.seen.size > 200)
      this.seen.delete(this.seen.values().next().value!)
    if (!context.enabled || context.doNotDisturb || context.reducedMotion || context.paused
      || !context.modelId || !context.waveAvailable || context.motionOwner !== 'idle'
      || now < intent.createdAt || now >= intent.expiresAt) {
      return null
    }

    return { modelId: context.modelId, requestId: intent.requestId, motionId: 'wave' as const, loop: false as const, duration: 5 }
  }
}
