import type { Client, ContextUpdate, ModuleAnnouncedEvent } from '@proj-airi/server-sdk'

import type { EventBus } from '../cognitive/event-bus'

import { useLogg } from '@guiiai/logg'
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

interface SparkCommandData {
  commandId: string
  intent: 'plan' | 'proposal' | 'action' | 'pause' | 'resume' | 'reroute' | 'context'
  interrupt: 'force' | 'soft' | false
  priority: 'critical' | 'high' | 'normal' | 'low'
  guidance?: {
    options?: Array<{ label: string, steps: string[] }>
  }
}

export class AiriBridge {
  private readonly logger = useLogg('airi-bridge').useGlobalConfig()
  private commandHandler: ((event: { data: SparkCommandData }) => void) | null = null
  private contextUpdateHandler: ((event: { data: ContextUpdate }) => void) | null = null
  private moduleAnnouncedHandler: ((event: { data: ModuleAnnouncedEvent }) => void) | null = null
  private readonly moduleAnnouncedListeners = new Set<(event: ModuleAnnouncedEvent) => void>()

  constructor(
    private readonly client: Client,
    private readonly eventBus: EventBus,
  ) {}

  init(): void {
    this.commandHandler = (event) => {
      const cmd = event.data
      this.logger.log('Received spark:command', { intent: cmd.intent, commandId: cmd.commandId })

      // Acknowledge receipt
      this.client.send({
        type: 'spark:emit',
        data: {
          id: nanoid(),
          eventId: cmd.commandId,
          state: 'queued',
          note: 'Command received',
        },
      } as Parameters<typeof this.client.send>[0])

      // A spark:command IS a command. The user requires that a desktop-relayed command carry the
      // EXACT same weight as the master typing in the in-game chat — i.e. it must trigger a fresh
      // decision (Conscious) cycle, never be silently filed into history. So we always route through
      // handleActionIntent (→ signal:chat_message → enqueueEvent → decision cycle).
      //
      // We intentionally no longer special-case `intent === 'context'`: that branch used to emit
      // signal:airi_context which Brain pushes to conversationHistory WITHOUT waking the loop, so a
      // desktop LLM that mislabels its intent as "context" would have its command silently dropped
      // from action. True passive context still has its own dedicated channel — `context:update`
      // (see contextUpdateHandler) — which remains history-only and is unaffected by this change.
      this.handleActionIntent(cmd)
    }

    this.contextUpdateHandler = (event) => {
      const ctx = event.data
      this.logger.log('Received context:update', { lane: ctx.lane, preview: ctx.text.slice(0, 80) })

      this.eventBus.emit({
        type: 'signal:airi_context',
        payload: Object.freeze({
          type: 'airi_context' as const,
          description: ctx.text,
          sourceId: 'airi',
          confidence: 1.0,
          timestamp: Date.now(),
          metadata: {
            source: 'airi',
            contextId: ctx.contextId,
            lane: ctx.lane ?? 'general',
            hints: ctx.hints ?? [],
          },
        }),
        source: { component: 'airi', id: 'bridge' },
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

  sendNotify(headline: string, note?: string, urgency: 'immediate' | 'soon' | 'later' = 'soon'): void {
    this.client.send({
      type: 'spark:notify',
      data: {
        id: nanoid(),
        eventId: nanoid(),
        kind: 'ping',
        urgency,
        headline,
        note,
        destinations: ['proj-airi:stage-*'],
      },
    } as Parameters<typeof this.client.send>[0])
    this.logger.log('Sent spark:notify', { headline, urgency })
  }

  sendContextUpdate(text: string, hints?: string[], lane?: string): void
  sendContextUpdate(update: ContextUpdate): void
  sendContextUpdate(textOrUpdate: string | Omit<ContextUpdate, 'strategy' | 'id' | 'contextId'> & { contextId?: string }, hints?: string[], lane = 'game'): void {
    const update = typeof textOrUpdate === 'string'
      ? {
        text: textOrUpdate,
        hints,
        lane,
        strategy: ContextUpdateStrategy.AppendSelf,
      } satisfies Omit<ContextUpdate, 'id' | 'contextId'> & { contextId?: string }
      : {
          strategy: ContextUpdateStrategy.AppendSelf,
          ...textOrUpdate,
        }

    const contextId = update.contextId ?? nanoid()
    this.client.send({
      type: 'context:update',
      data: {
        id: nanoid(),
        contextId,
        lane: update.lane,
        text: update.text,
        hints: update.hints,
        strategy: update.strategy,
        destinations: update.destinations,
      },
    } as Parameters<typeof this.client.send>[0])
    this.logger.log('Sent context:update', { lane: update.lane, preview: update.text.slice(0, 80), contextId })
  }

  sendEmit(eventId: string, state: 'queued' | 'working' | 'done' | 'dropped', note?: string): void {
    this.client.send({
      type: 'spark:emit',
      data: {
        id: nanoid(),
        eventId,
        state,
        note,
      },
    } as Parameters<typeof this.client.send>[0])
    this.logger.log('Sent spark:emit', { eventId, state })
  }

  onModuleAnnounced(listener: (event: ModuleAnnouncedEvent) => void) {
    this.moduleAnnouncedListeners.add(listener)

    return () => {
      this.moduleAnnouncedListeners.delete(listener)
    }
  }

  private handleActionIntent(cmd: SparkCommandData): void {
    // Treat a desktop-AIRI spark:command as if the master typed it in the in-game chat:
    // route through the SAME `signal:chat_message` path so brain handles it identically to
    // a real player chat (resetNoActionFollowupBudget('player_chat'), normal Conscious wake
    // up, no special "another agent" framing). User intent: "the desktop AIRI is just an
    // extension of me — when she relays a command, the in-game bot should feel it as me."
    const firstOption = cmd.guidance?.options?.[0]
    const label = firstOption?.label?.trim()
    const steps = firstOption?.steps ?? []
    // Prefer the short label (closest to what the user actually said). Fall back to joined
    // steps so brain still has detail when label is missing.
    const message = label && label.length > 0
      ? label
      : (steps.length > 0 ? steps.join(' / ') : `${cmd.intent} command received`)

    const username = '主人'

    this.logger.log('Relaying AIRI spark:command as in-game chat from master', {
      commandId: cmd.commandId,
      message,
    })

    this.eventBus.emit({
      type: 'signal:chat_message',
      payload: Object.freeze({
        type: 'chat_message' as const,
        description: `Chat from ${username}: "${message}"`,
        sourceId: username,
        confidence: 1.0,
        timestamp: Date.now(),
        metadata: {
          username,
          message,
          // Keep the spark provenance for debugging / future special-casing, but the brain
          // doesn't need to know — it just sees a chat_message from the master.
          sparkCommandId: cmd.commandId,
          sparkIntent: cmd.intent,
          relayedFrom: 'desktop-airi',
        },
      }),
      source: { component: 'airi', id: 'bridge' },
    })
  }
}
