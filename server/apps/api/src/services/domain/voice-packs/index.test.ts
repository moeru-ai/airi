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
      costMultiplier: 1.5,
      enabled: true,
      model: 'seed-tts-2.0',
      name: 'Neuro Sama',
      params: { pitch: 20, volume: 5 },
      provider: 'volcengine',
      ttsModelId: 'volcengine/neuro-pool',
      upstreamVoiceId: 'voice-neuro-upstream',
      voiceId: 'voice-neuro',
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
      costMultiplier: 1,
      enabled: true,
      model: 'seed-tts-2.0',
      name: 'Base',
      params: {},
      provider: 'volcengine',
      ttsModelId: 'volcengine/pool',
      upstreamVoiceId: 'voice-a-upstream',
      voiceId: 'voice-a',
    })
    await service.create({
      costMultiplier: 1,
      enabled: true,
      model: 'seed-tts-2.0',
      name: 'Pitched',
      params: { pitch: 20 },
      provider: 'volcengine',
      ttsModelId: 'volcengine/pool',
      upstreamVoiceId: 'voice-a-upstream',
      voiceId: 'voice-a',
    })

    const packs = await service.list()
    expect(packs).toHaveLength(2)
    expect(packs.map(p => p.name).sort()).toEqual(['Base', 'Pitched'])
  })

  it('updates mutable fields without replacing the row', async () => {
    // @example edit curation metadata/params -> same id, updated values.
    const pack = await service.create({
      costMultiplier: 1,
      enabled: true,
      model: 'v1',
      name: 'Old',
      params: {},
      provider: 'azure',
      ttsModelId: 'microsoft/v1',
      upstreamVoiceId: 'en-US-AvaMultilingualNeural',
      voiceId: 'en-US-AvaMultilingualNeural',
    })

    const updated = await service.update(pack.id, {
      costMultiplier: 2,
      name: 'New',
      params: { rate: 1.1 },
    })

    expect(updated?.id).toBe(pack.id)
    expect(updated?.name).toBe('New')
    expect(updated?.params).toEqual({ rate: 1.1 })
    expect(updated?.costMultiplier).toBe(2)
  })

  it('soft-disables a pack and excludes it from listEnabled', async () => {
    // @example disabled packs remain in admin list but disappear from user list.
    const pack = await service.create({
      costMultiplier: 1,
      enabled: true,
      model: 'cosyvoice-v2',
      name: 'Disable me',
      params: {},
      provider: 'dashscope-cosyvoice',
      ttsModelId: 'alibaba/cosyvoice-v2',
      upstreamVoiceId: 'longxiaochun_v2',
      voiceId: 'longxiaochun_v2',
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
      costMultiplier: 1,
      enabled: false,
      model: 'v1',
      name: 'Disabled narrator',
      params: {},
      provider: 'azure',
      ttsModelId: 'microsoft/v1',
      upstreamVoiceId: 'disabled-upstream',
      voiceId: 'narrator',
    })
    const enabled = await service.create({
      costMultiplier: 1,
      enabled: true,
      model: 'v1',
      name: 'Enabled narrator',
      params: {},
      provider: 'azure',
      ttsModelId: 'microsoft/v1',
      upstreamVoiceId: 'enabled-upstream',
      voiceId: 'narrator',
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
