import type { Buffer } from 'node:buffer'

import type { MqttClient } from 'mqtt'
import type { GenericSchema, InferOutput } from 'valibot'

import type { CompanionPublisher } from './companion-service'
import type { AffectUpdated, CompanionSnapshot } from './companion-state'
import type { CompanionEvent } from './contracts'

import { randomUUID } from 'node:crypto'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { safeParse } from 'valibot'

import {
  InteractionMessageSchema,
  MoodMessageSchema,
  ProposalMessageSchema,
  ResetMessageSchema,
  SettingsMessageSchema,
} from './contracts'

/** Value of `origin` in messages that this service publishes. Mood messages with it are ignored. */
export const companionOrigin = 'alice-companion'

const topicRoot = 'neoalice/v1'

/** Output topics. They live under their own site, so no NeoAlice consumer reads them by accident. */
export function companionTopics(publishSite: string) {
  return {
    /** Retained. Latest {@link CompanionSnapshot}. */
    state: `${topicRoot}/${publishSite}/evt/companion/state`,
    /** Not retained. One {@link AffectUpdated} per mood or energy change. */
    affect: `${topicRoot}/${publishSite}/evt/companion/affect`,
    /** Retained. `{ "online": boolean }`. The broker publishes `false` as the last will. */
    status: `${topicRoot}/${publishSite}/evt/companion/status`,
  }
}

export interface GatewayHandlers {
  onEvent: (event: CompanionEvent) => Promise<unknown>
  onSnapshotRequest: () => Promise<void>
}

export interface MqttGatewayOptions {
  client: MqttClient
  /** Site of the output topics. Input messages on this site are ignored. */
  publishSite: string
  /** Sites to read. An empty list reads all sites. */
  inputSites: string[]
  /**
   * Counts a turn when `cmd/tts/say` or `cmd/tts/audio` follows `evt/stt/final` on the same site.
   * Used while the NeoAlice backend does not publish `evt/companion/interaction`.
   */
  deriveInteractions: boolean
  /** Longest time between the speech-to-text result and the speech command of one derived turn. */
  deriveWindowMs: number
  now: () => Date
}

/** Identical payloads on one topic within this window are one message. The module can read two brokers. */
const repeatWindowMs = 2_000

const log = useLogger('alice-companion:mqtt')

/**
 * MQTT boundary of the companion service. It turns NeoAlice topics into validated
 * {@link CompanionEvent}s and publishes the service output.
 *
 * Topic shape: `neoalice/v1/<site>/<action>`. The site is the correlation key for derived
 * turns. An invalid payload is logged and dropped. It never stops the gateway.
 */
export class MqttGateway implements CompanionPublisher {
  private readonly topics: ReturnType<typeof companionTopics>
  /** Time of the last unanswered `evt/stt/final` per site. Runtime state only. */
  private readonly pendingSpeech = new Map<string, number>()
  /** Last receive time per topic and payload, for {@link repeatWindowMs}. Runtime state only. */
  private readonly recentPayloads = new Map<string, number>()
  /**
   * Sites that sent an explicit `evt/companion/interaction` since start. Derivation stops for
   * them, so one turn is not counted twice. Runtime state only: after a restart, the first
   * explicit turn of a site can still follow one derived turn.
   */
  private readonly sitesWithExplicitTurns = new Set<string>()

  constructor(private readonly options: MqttGatewayOptions) {
    this.topics = companionTopics(options.publishSite)
  }

  /** Subscribes and starts routing. Call it once. Reconnects resubscribe through the MQTT client. */
  start(handlers: GatewayHandlers): void {
    const { client } = this.options
    const subscriptions = [
      `${topicRoot}/+/evt/mood`,
      `${topicRoot}/+/cmd/evt/mood`,
      `${topicRoot}/+/evt/companion/interaction`,
      `${topicRoot}/+/cmd/companion/+`,
    ]
    if (this.options.deriveInteractions)
      subscriptions.push(`${topicRoot}/+/evt/stt/final`, `${topicRoot}/+/cmd/tts/say`, `${topicRoot}/+/cmd/tts/audio`)

    const announce = () => {
      void this.publish(this.topics.status, { online: true }, true)
      void handlers.onSnapshotRequest()
    }
    client.on('connect', announce)
    // The client connects while the service loads its state, so the first `connect` event
    // can fire before this listener exists.
    if (client.connected)
      announce()
    client.on('message', (topic, payload) => {
      this.route(topic, payload, handlers).catch((error) => {
        log.withError(error).withFields({ topic }).warn(`Message failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
      })
    })
    client.subscribe(subscriptions, { qos: 1 }, (error) => {
      if (error)
        log.withError(error).error('Subscribe failed')
    })
  }

  /** Publishes the offline status and closes the connection. */
  async stop(): Promise<void> {
    await this.publish(this.topics.status, { online: false }, true)
    await this.options.client.endAsync()
  }

  async publishState(snapshot: CompanionSnapshot): Promise<void> {
    await this.publish(this.topics.state, snapshot, true)
  }

  async publishAffect(affect: AffectUpdated): Promise<void> {
    await this.publish(this.topics.affect, affect, false)
  }

  private async publish(topic: string, body: unknown, retain: boolean): Promise<void> {
    await this.options.client.publishAsync(topic, JSON.stringify(body), { qos: 1, retain })
  }

  private async route(topic: string, payload: Buffer, handlers: GatewayHandlers): Promise<void> {
    const match = /^neoalice\/v1\/([^/]+)\/(.+)$/.exec(topic)
    if (!match)
      return
    const [, site, action] = match
    // Our own output site is never input. This stops loops if a broker bridge echoes our topics.
    if (site === this.options.publishSite)
      return
    if (this.options.inputSites.length > 0 && !this.options.inputSites.includes(site))
      return

    const at = this.options.now()

    if (action === 'evt/stt/final' || action === 'cmd/tts/say' || action === 'cmd/tts/audio') {
      if (this.options.deriveInteractions && !this.sitesWithExplicitTurns.has(site))
        await this.trackSpeechTurn(site, action, at, handlers)
      return
    }

    if (this.isRepeatedPayload(topic, payload, at))
      return

    let json: unknown
    try {
      json = JSON.parse(payload.toString('utf8'))
    }
    catch {
      log.withFields({ topic }).warn('Payload is not JSON. Ignored.')
      return
    }

    switch (action) {
      case 'evt/mood':
      case 'cmd/evt/mood':
        return this.routeMood(site, json, at, handlers)
      case 'evt/companion/interaction': {
        const message = this.validate(InteractionMessageSchema, json, topic)
        if (!message)
          return
        this.sitesWithExplicitTurns.add(site)
        this.pendingSpeech.delete(site)
        await handlers.onEvent({ kind: 'interaction', eventId: message.eventId, at, site, origin: 'explicit', interrupted: message.interrupted ?? false })
        return
      }
      case 'cmd/companion/proposal': {
        const message = this.validate(ProposalMessageSchema, json, topic)
        if (message)
          await handlers.onEvent({ kind: 'proposal', eventId: message.eventId, at, sourceEventId: message.sourceEventId, deltas: message.suggestedDeltas, reason: message.reason })
        return
      }
      case 'cmd/companion/settings': {
        const message = this.validate(SettingsMessageSchema, json, topic)
        if (message)
          await handlers.onEvent({ kind: 'settings', eventId: message.eventId, at, mode: message.mode, consent: message.consent })
        return
      }
      case 'cmd/companion/reset': {
        const message = this.validate(ResetMessageSchema, json, topic)
        if (message)
          await handlers.onEvent({ kind: 'reset', eventId: message.eventId, at, scope: message.scope })
        return
      }
      case 'cmd/companion/get':
        return handlers.onSnapshotRequest()
      default:
        log.withFields({ topic }).warn('Unknown companion command. Ignored.')
    }
  }

  private async routeMood(site: string, json: unknown, at: Date, handlers: GatewayHandlers): Promise<void> {
    const message = this.validate(MoodMessageSchema, json, `${site}/mood`)
    if (!message || message.origin === companionOrigin)
      return
    const mood = message.mood ?? message.state?.mood
    if (mood === undefined) {
      log.withFields({ site }).warn('Mood message has no mood. Ignored.')
      return
    }

    const causes = [...(message.causes ?? [])]
    if (message.cause)
      causes.push(message.cause)

    await handlers.onEvent({
      kind: 'mood',
      // NOTICE: The current NeoAlice producer sends no event ID. A random ID is safe because
      // the reducer keeps an identical mood unchanged, and the repeat window drops broker duplicates.
      eventId: message.eventId ?? randomUUID(),
      at,
      site,
      mood,
      intensity: message.intensity,
      energy: message.energy,
      causes,
    })
  }

  /**
   * Derived turn state per site: `evt/stt/final` opens a turn, the next speech command
   * on the same site within the window closes it. A speech command without an open turn
   * (a reminder, a test message) does not count.
   */
  private async trackSpeechTurn(site: string, action: string, at: Date, handlers: GatewayHandlers): Promise<void> {
    if (action === 'evt/stt/final') {
      this.pendingSpeech.set(site, at.getTime())
      return
    }
    const openedAt = this.pendingSpeech.get(site)
    if (openedAt === undefined)
      return
    this.pendingSpeech.delete(site)
    if (at.getTime() - openedAt > this.options.deriveWindowMs)
      return
    await handlers.onEvent({ kind: 'interaction', eventId: `derived:${site}:${randomUUID()}`, at, site, origin: 'derived', interrupted: false })
  }

  private isRepeatedPayload(topic: string, payload: Buffer, at: Date): boolean {
    const now = at.getTime()
    for (const [key, seenAt] of this.recentPayloads) {
      if (now - seenAt > repeatWindowMs)
        this.recentPayloads.delete(key)
    }
    const key = `${topic}\n${payload.toString('utf8')}`
    if (this.recentPayloads.has(key))
      return true
    this.recentPayloads.set(key, now)
    return false
  }

  private validate<TSchema extends GenericSchema>(schema: TSchema, json: unknown, label: string): InferOutput<TSchema> | undefined {
    const result = safeParse(schema, json)
    if (!result.success) {
      log.withFields({ label, issue: result.issues[0].message }).warn('Invalid message. Ignored.')
      return undefined
    }
    return result.output
  }
}
