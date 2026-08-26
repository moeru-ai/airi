import type { Client, ContextUpdate, ModuleAnnouncedEvent } from '@proj-airi/server-sdk'

import type { EventBus } from '../cognitive/event-bus'

import { useLogg } from '@guiiai/logg'
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

interface SparkCommandData {
  commandId: string
  guidance?: {
    options?: Array<{ label: string, steps: string[] }>
  }
  intent: 'action' | 'context' | 'pause' | 'plan' | 'proposal' | 'reroute' | 'resume'
  interrupt: 'force' | 'soft' | false
  priority: 'critical' | 'high' | 'low' | 'normal'
}

/**
 * Connects the Minecraft cognitive runtime to AIRI server events.
 *
 * Use when:
 * - Minecraft must publish context and notifications to Stage runtimes.
 * - Generic `spark:command` events must wake the Minecraft decision loop.
 *
 * Expects:
 * - {@link init} is called once before events are exchanged.
 * - {@link setCommandAvailable} follows the active bot lifecycle.
 *
 * Returns:
 * - Event handlers and send operations for the Minecraft side of the AIRI server seam.
 */
export class AiriBridge {
  private commandAvailable = false
  private commandHandler: ((event: { data: SparkCommandData }) => void) | null = null
  private contextUpdateHandler: ((event: { data: ContextUpdate }) => void) | null = null
  private readonly logger = useLogg('airi-bridge').useGlobalConfig()
  private moduleAnnouncedHandler: ((event: { data: ModuleAnnouncedEvent }) => void) | null = null
  private readonly moduleAnnouncedListeners = new Set<(event: ModuleAnnouncedEvent) => void>()

  constructor(
    private readonly client: Client,
    private readonly eventBus: EventBus,
  ) {}

  destroy(): void {
    if (this.commandHandler) {
      this.client.offEvent('spark:command', this.commandHandler as Parameters<typeof this.client.offEvent<'spark:command'>>[1])
      this.commandHandler = null
    }
    if (this.contextUpdateHandler) {
      this.client.offEvent('context:update', this.contextUpdateHandler as Parameters<typeof this.client.offEvent<'context:update'>>[1])
      this.contextUpdateHandler = null
    }
    if (this.moduleAnnouncedHandler) {
      this.client.offEvent('module:announced', this.moduleAnnouncedHandler as Parameters<typeof this.client.offEvent<'module:announced'>>[1])
      this.moduleAnnouncedHandler = null
    }
    this.moduleAnnouncedListeners.clear()
    this.logger.log('AiriBridge destroyed')
  }

  init(): void {
    this.commandHandler = (event) => {
      const cmd = event.data
      this.logger.log('Received spark:command', { commandId: cmd.commandId, intent: cmd.intent })

      if (!this.commandAvailable) {
        this.sendEmit(cmd.commandId, 'dropped', 'Minecraft bot is offline')
        return
      }

      this.sendEmit(cmd.commandId, 'queued', 'Command received')

      // A spark:command is high-level guidance from the AIRI server. It must carry enough weight to
      // trigger a fresh decision (Conscious) cycle, never be silently filed into history — so we
      // always route it through handleActionIntent (→ signal:airi_command → enqueueEvent → decision cycle).
      //
      // We intentionally do not special-case `intent === 'context'`: that branch used to emit
      // signal:airi_context which Brain pushes to conversationHistory WITHOUT waking the loop, so a
      // command that mislabels its intent as "context" would be silently dropped from action. True
      // passive context still has its own dedicated channel — `context:update` (see
      // contextUpdateHandler) — which remains history-only and is unaffected by this routing.
      this.handleActionIntent(cmd)
    }

    this.contextUpdateHandler = (event) => {
      const ctx = event.data
      this.logger.log('Received context:update', { lane: ctx.lane, preview: ctx.text.slice(0, 80) })

      this.eventBus.emit({
        payload: Object.freeze({
          confidence: 1.0,
          description: ctx.text,
          metadata: {
            contextId: ctx.contextId,
            hints: ctx.hints ?? [],
            lane: ctx.lane ?? 'general',
            source: 'airi',
          },
          sourceId: 'airi',
          timestamp: Date.now(),
          type: 'airi_context' as const,
        }),
        source: { component: 'airi', id: 'bridge' },
        type: 'signal:airi_context',
      })
    }

    this.moduleAnnouncedHandler = (event) => {
      const moduleAnnouncement = event.data
      this.logger.log('Received module:announced', { name: moduleAnnouncement.name, pluginId: moduleAnnouncement.identity?.plugin?.id })
      for (const listener of this.moduleAnnouncedListeners) {
        listener(moduleAnnouncement)
      }
    }

    this.client.onEvent('spark:command', this.commandHandler as Parameters<typeof this.client.onEvent<'spark:command'>>[1])
    this.client.onEvent('context:update', this.contextUpdateHandler as Parameters<typeof this.client.onEvent<'context:update'>>[1])
    this.client.onEvent('module:announced', this.moduleAnnouncedHandler as Parameters<typeof this.client.onEvent<'module:announced'>>[1])
    this.logger.log('AiriBridge initialized, listening for spark:command, context:update, and module:announced')
  }

  onModuleAnnounced(listener: (event: ModuleAnnouncedEvent) => void) {
    this.moduleAnnouncedListeners.add(listener)

    return () => {
      this.moduleAnnouncedListeners.delete(listener)
    }
  }

  sendContextUpdate(text: string, hints?: string[], lane?: string): void
  sendContextUpdate(update: ContextUpdate): void
  sendContextUpdate(textOrUpdate: Omit<ContextUpdate, 'contextId' | 'id' | 'strategy'> & { contextId?: string } | string, hints?: string[], lane = 'game'): void {
    const update = typeof textOrUpdate === 'string'
      ? {
        hints,
        lane,
        strategy: ContextUpdateStrategy.AppendSelf,
        text: textOrUpdate,
      } satisfies Omit<ContextUpdate, 'contextId' | 'id'> & { contextId?: string }
      : {
          strategy: ContextUpdateStrategy.AppendSelf,
          ...textOrUpdate,
        }

    const contextId = update.contextId ?? nanoid()
    this.client.send({
      data: {
        contextId,
        destinations: update.destinations,
        hints: update.hints,
        id: nanoid(),
        lane: update.lane,
        strategy: update.strategy,
        text: update.text,
      },
      type: 'context:update',
    } as Parameters<typeof this.client.send>[0])
    this.logger.log('Sent context:update', { contextId, lane: update.lane, preview: update.text.slice(0, 80) })
  }

  sendEmit(eventId: string, state: 'done' | 'dropped' | 'queued' | 'working', note?: string): void {
    this.client.send({
      data: {
        eventId,
        id: nanoid(),
        note,
        state,
      },
      type: 'spark:emit',
    } as Parameters<typeof this.client.send>[0])
    this.logger.log('Sent spark:emit', { eventId, state })
  }

  sendNotify(headline: string, note?: string, urgency: 'immediate' | 'later' | 'soon' = 'soon'): void {
    this.client.send({
      data: {
        destinations: ['proj-airi:stage-*'],
        eventId: nanoid(),
        headline,
        id: nanoid(),
        kind: 'ping',
        note,
        urgency,
      },
      type: 'spark:notify',
    } as Parameters<typeof this.client.send>[0])
    this.logger.log('Sent spark:notify', { headline, urgency })
  }

  /** Enables command delivery only while a Minecraft bot runtime can consume it. */
  setCommandAvailable(available: boolean): void {
    this.commandAvailable = available
  }

  private handleActionIntent(cmd: SparkCommandData): void {
    // A spark:command is high-level guidance from the AIRI server. Route it through the explicit
    // `airi_command` signal so the brain runs a fresh decision cycle
    // (resetNoActionFollowupBudget('airi_command'), normal Conscious wake-up) instead of silently
    // filing it into history. The directive is attributed to the AIRI server as a neutral source,
    // not to any specific in-game player. The status context tells Stage when this relay is available
    // while this bridge remains the final receiver-side availability gate.
    const firstOption = cmd.guidance?.options?.[0]
    const label = firstOption?.label?.trim()
    const steps = firstOption?.steps ?? []
    // Prefer the short label (closest to the original instruction). Fall back to joined steps so the
    // brain still has detail when label is missing.
    const message = label && label.length > 0
      ? label
      : (steps.length > 0 ? steps.join(' / ') : `${cmd.intent} command received`)

    const sourceId = 'airi'

    this.logger.log('Routing spark:command as an AIRI directive', {
      commandId: cmd.commandId,
      message,
    })

    this.eventBus.emit({
      payload: Object.freeze({
        confidence: 1.0,
        description: `Directive from AIRI: "${message}"`,
        metadata: {
          message,
          // Keep the spark provenance for debugging; the brain sees a typed AIRI directive.
          sparkCommandId: cmd.commandId,
          sparkIntent: cmd.intent,
        },
        sourceId,
        timestamp: Date.now(),
        type: 'airi_command' as const,
      }),
      source: { component: 'airi', id: 'bridge' },
      type: 'signal:airi_command',
    })
  }
}
