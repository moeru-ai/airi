import type { Database } from '../../../libs/db'

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createVoicePackService } from '.'
import { mockDB } from '../../../libs/mock-db'

import * as schema from '../../../schemas'

describe('voicePackService', () => {
  let db: Database
  let service: ReturnType<typeof createVoicePackService>

  beforeAll(async () => {
    db = await mockDB(schema)
    service = createVoicePackService(db)
  })

  beforeEach(async () => {
    await db.delete(schema.voicePacks)
  })

  it('creates a Voice Pack with provider, model, voice, params, cost multiplier, and tts model pin', async () => {
    // @example create one curated cloud voice -> row stores the resolved routing pin.
    const pack = await service.create({
      name: 'Neuro Sama',
      provider: 'volcengine',
      model: 'seed-tts-2.0',
      voiceId: 'voice-neuro',
      upstreamVoiceId: 'voice-neuro-upstream',
      ttsModelId: 'volcengine/neuro-pool',
      params: { pitch: 20, volume: 5 },
      costMultiplier: 1.5,
      enabled: true,
    })

    expect(pack.name).toBe('Neuro Sama')
    expect(pack.provider).toBe('volcengine')
    expect(pack.model).toBe('seed-tts-2.0')
    expect(pack.voiceId).toBe('voice-neuro')
    expect(pack.upstreamVoiceId).toBe('voice-neuro-upstream')
    expect(pack.ttsModelId).toBe('volcengine/neuro-pool')
    expect(pack.params).toEqual({ pitch: 20, volume: 5 })
    expect(pack.costMultiplier).toBe(1.5)
    expect(pack.enabled).toBe(true)
  })

  it('keeps parameter variants as separate packs', async () => {
    // @example same provider/model/voice with different params -> two library entries.
    await service.create({
      name: 'Base',
      provider: 'volcengine',
      model: 'seed-tts-2.0',
      voiceId: 'voice-a',
      upstreamVoiceId: 'voice-a-upstream',
      ttsModelId: 'volcengine/pool',
      params: {},
      costMultiplier: 1,
      enabled: true,
    })
    await service.create({
      name: 'Pitched',
      provider: 'volcengine',
      model: 'seed-tts-2.0',
      voiceId: 'voice-a',
      upstreamVoiceId: 'voice-a-upstream',
      ttsModelId: 'volcengine/pool',
      params: { pitch: 20 },
      costMultiplier: 1,
      enabled: true,
    })

    const packs = await service.list()
    expect(packs).toHaveLength(2)
    expect(packs.map(p => p.name).sort()).toEqual(['Base', 'Pitched'])
  })

  it('updates mutable fields without replacing the row', async () => {
    // @example edit curation metadata/params -> same id, updated values.
    const pack = await service.create({
      name: 'Old',
      provider: 'azure',
      model: 'v1',
      voiceId: 'en-US-AvaMultilingualNeural',
      upstreamVoiceId: 'en-US-AvaMultilingualNeural',
      ttsModelId: 'microsoft/v1',
      params: {},
      costMultiplier: 1,
      enabled: true,
    })

    const updated = await service.update(pack.id, {
      name: 'New',
      params: { rate: 1.1 },
      costMultiplier: 2,
    })

    expect(updated?.id).toBe(pack.id)
    expect(updated?.name).toBe('New')
    expect(updated?.params).toEqual({ rate: 1.1 })
    expect(updated?.costMultiplier).toBe(2)
  })

  it('soft-disables a pack and excludes it from listEnabled', async () => {
    // @example disabled packs remain in admin list but disappear from user list.
    const pack = await service.create({
      name: 'Disable me',
      provider: 'dashscope-cosyvoice',
      model: 'cosyvoice-v2',
      voiceId: 'longxiaochun_v2',
      upstreamVoiceId: 'longxiaochun_v2',
      ttsModelId: 'alibaba/cosyvoice-v2',
      params: {},
      costMultiplier: 1,
      enabled: true,
    })

    const disabled = await service.disable(pack.id)
    const all = await service.list()
    const enabled = await service.listEnabled()

    expect(disabled?.enabled).toBe(false)
    expect(all).toHaveLength(1)
    expect(enabled).toEqual([])
  })

  it('finds only enabled packs by product-facing voice alias', async () => {
    // @example TTS request voice="narrator" -> enabled Voice Pack row resolves server-side.
    await service.create({
      name: 'Disabled narrator',
      provider: 'azure',
      model: 'v1',
      voiceId: 'narrator',
      upstreamVoiceId: 'disabled-upstream',
      ttsModelId: 'microsoft/v1',
      params: {},
      costMultiplier: 1,
      enabled: false,
    })
    const enabled = await service.create({
      name: 'Enabled narrator',
      provider: 'azure',
      model: 'v1',
      voiceId: 'narrator',
      upstreamVoiceId: 'enabled-upstream',
      ttsModelId: 'microsoft/v1',
      params: {},
      costMultiplier: 1,
      enabled: true,
    })

    expect(await service.findEnabledByVoiceId('narrator')).toMatchObject({
      id: enabled.id,
      upstreamVoiceId: 'enabled-upstream',
    })
  })

  it('returns null when updating or disabling a missing pack', async () => {
    // @example unknown id -> null so routes can map to 404.
    expect(await service.update('missing', { name: 'Nope' })).toBeNull()
    expect(await service.disable('missing')).toBeNull()
  })
})
