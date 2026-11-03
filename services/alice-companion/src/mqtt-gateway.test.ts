import type { IPublishPacket } from 'mqtt'

import type { GatewayHandlers, MqttGatewayOptions } from './mqtt-gateway'

import { Buffer } from 'node:buffer'

import { connect } from 'mqtt'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { companionTopics, MqttGateway } from './mqtt-gateway'

// A real MQTT client that never connects. Tests deliver messages with `emit` and spy on the
// network methods, so the routing code runs against the real client API.
function createClient() {
  const client = connect('mqtt://127.0.0.1:1', { manualConnect: true, reconnectPeriod: 0 })
  vi.spyOn(client, 'subscribe').mockImplementation(() => client)
  const publishAsync = vi.spyOn(client, 'publishAsync').mockResolvedValue(undefined)
  return { client, publishAsync }
}

let clock = Date.parse('2026-11-03T12:00:00Z')

function createGateway(overrides: Partial<MqttGatewayOptions> = {}) {
  const { client, publishAsync } = createClient()
  const gateway = new MqttGateway({
    client,
    publishSite: 'companion',
    inputSites: [],
    deriveInteractions: true,
    deriveWindowMs: 120_000,
    now: () => new Date(clock),
    ...overrides,
  })
  const handlers = {
    onEvent: vi.fn<GatewayHandlers['onEvent']>(async () => {}),
    onSnapshotRequest: vi.fn<GatewayHandlers['onSnapshotRequest']>(async () => {}),
  }
  gateway.start(handlers)

  const deliver = (topic: string, body: unknown) => {
    const payload = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    const packet: IPublishPacket = { cmd: 'publish', topic, payload, qos: 0, dup: false, retain: false }
    client.emit('message', topic, payload, packet)
  }
  return { gateway, client, publishAsync, handlers, deliver }
}

afterEach(() => {
  clock = Date.parse('2026-11-03T12:00:00Z')
  vi.restoreAllMocks()
})

describe('mqttGateway', () => {
  it('turns the current NeoAlice mood payloads into mood events', async () => {
    const { handlers, deliver } = createGateway()

    deliver('neoalice/v1/mirror/evt/mood', { mood: 'love' })
    deliver('neoalice/v1/mirror/cmd/evt/mood', { state: { mood: 'sad' }, cause: 'bad news' })

    await vi.waitFor(() => expect(handlers.onEvent).toHaveBeenCalledTimes(2))
    expect(handlers.onEvent.mock.calls[0][0]).toMatchObject({ kind: 'mood', mood: 'love', site: 'mirror', causes: [] })
    expect(handlers.onEvent.mock.calls[1][0]).toMatchObject({ kind: 'mood', mood: 'sad', causes: ['bad news'] })
  })

  it('drops an invalid optional field but keeps the mood', async () => {
    const { handlers, deliver } = createGateway()

    deliver('neoalice/v1/mirror/evt/mood', { mood: 'happy', intensity: 'very' })

    await vi.waitFor(() => expect(handlers.onEvent).toHaveBeenCalledTimes(1))
    expect(handlers.onEvent.mock.calls[0][0]).toMatchObject({ kind: 'mood', mood: 'happy', intensity: undefined })
  })

  it('ignores non-JSON payloads, its own origin, and its own site', async () => {
    const { handlers, deliver } = createGateway()

    deliver('neoalice/v1/mirror/evt/mood', 'not json')
    deliver('neoalice/v1/mirror/evt/mood', { mood: 'happy', origin: 'alice-companion' })
    deliver('neoalice/v1/companion/evt/mood', { mood: 'happy' })
    deliver('neoalice/v1/mirror/cmd/companion/reset', { schemaVersion: 1, eventId: 'r1', scope: 'all' })
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(handlers.onEvent).not.toHaveBeenCalled()
  })

  it('drops the same payload on the same topic within the repeat window', async () => {
    const { handlers, deliver } = createGateway()

    deliver('neoalice/v1/mirror/evt/mood', { mood: 'happy' })
    deliver('neoalice/v1/mirror/evt/mood', { mood: 'happy' })
    clock += 3_000
    deliver('neoalice/v1/mirror/evt/mood', { mood: 'happy' })

    await vi.waitFor(() => expect(handlers.onEvent).toHaveBeenCalledTimes(2))
  })

  it('derives one turn from a speech result followed by a speech command on the same site', async () => {
    const { handlers, deliver } = createGateway()

    deliver('neoalice/v1/mirror/cmd/tts/say', { text: 'reminder without a question' })
    deliver('neoalice/v1/mirror/evt/stt/final', { text: 'hello' })
    deliver('neoalice/v1/mirror/cmd/tts/say', { text: 'hi' })
    deliver('neoalice/v1/mirror/cmd/tts/say', { text: 'second sentence' })

    await vi.waitFor(() => expect(handlers.onEvent).toHaveBeenCalledTimes(1))
    expect(handlers.onEvent.mock.calls[0][0]).toMatchObject({ kind: 'interaction', origin: 'derived', site: 'mirror' })
  })

  it('does not derive a turn when the answer comes after the window or derivation is off', async () => {
    const late = createGateway()
    late.deliver('neoalice/v1/mirror/evt/stt/final', { text: 'hello' })
    clock += 121_000
    late.deliver('neoalice/v1/mirror/cmd/tts/say', { text: 'hi' })

    const off = createGateway({ deriveInteractions: false })
    off.deliver('neoalice/v1/mirror/evt/stt/final', { text: 'hello' })
    off.deliver('neoalice/v1/mirror/cmd/tts/say', { text: 'hi' })
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(late.handlers.onEvent).not.toHaveBeenCalled()
    expect(off.handlers.onEvent).not.toHaveBeenCalled()
  })

  it('stops deriving turns for a site that sends explicit turns', async () => {
    const { handlers, deliver } = createGateway()

    deliver('neoalice/v1/mirror/evt/companion/interaction', { schemaVersion: 1, eventId: 'turn-explicit' })
    deliver('neoalice/v1/mirror/evt/stt/final', { text: 'hello' })
    deliver('neoalice/v1/mirror/cmd/tts/say', { text: 'hi' })
    deliver('neoalice/v1/kitchen/evt/stt/final', { text: 'hello' })
    deliver('neoalice/v1/kitchen/cmd/tts/say', { text: 'hi' })

    await vi.waitFor(() => expect(handlers.onEvent).toHaveBeenCalledTimes(2))
    expect(handlers.onEvent.mock.calls.map(call => call[0].eventId)).toEqual(['turn-explicit', expect.stringMatching(/^derived:kitchen:/)])
  })

  it('routes validated companion commands', async () => {
    const { handlers, deliver } = createGateway()

    deliver('neoalice/v1/mirror/evt/companion/interaction', { schemaVersion: 1, eventId: 'turn-1' })
    deliver('neoalice/v1/mirror/cmd/companion/proposal', { schemaVersion: 1, eventId: 'p1', sourceEventId: 'turn-1', suggestedDeltas: { trust: 1 } })
    deliver('neoalice/v1/mirror/cmd/companion/reset', { schemaVersion: 1, eventId: 'r1', scope: 'mood', confirm: true })
    deliver('neoalice/v1/mirror/cmd/companion/get', {})

    await vi.waitFor(() => expect(handlers.onEvent).toHaveBeenCalledTimes(3))
    expect(handlers.onEvent.mock.calls.map(call => call[0].kind)).toEqual(['interaction', 'proposal', 'reset'])
    expect(handlers.onSnapshotRequest).toHaveBeenCalledTimes(1)
  })

  it('reads only the configured sites', async () => {
    const { handlers, deliver } = createGateway({ inputSites: ['mirror'] })

    deliver('neoalice/v1/kitchen/evt/mood', { mood: 'happy' })
    deliver('neoalice/v1/mirror/evt/mood', { mood: 'sad' })

    await vi.waitFor(() => expect(handlers.onEvent).toHaveBeenCalledTimes(1))
    expect(handlers.onEvent.mock.calls[0][0]).toMatchObject({ mood: 'sad' })
  })

  it('publishes the state retained and the affect not retained', async () => {
    const { gateway, publishAsync } = createGateway()
    const topics = companionTopics('companion')

    await gateway.publishAffect({
      schemaVersion: 1,
      eventType: 'companion.affect.updated',
      eventId: 'affect-alice-1',
      personaId: 'alice',
      emotion: 'happy',
      talkingheadMood: 'happy',
      airiEmotion: 'happy',
      intensity: null,
      energy: 100,
      relationshipMode: 'companion',
      sourceEventId: 'm1',
    })

    expect(publishAsync).toHaveBeenCalledWith(topics.affect, expect.any(String), { qos: 1, retain: false })
    expect(topics.state).toBe('neoalice/v1/companion/evt/companion/state')
  })
})
