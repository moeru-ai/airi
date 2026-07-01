import type { Database } from '../../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createOfficialCatalogService } from '.'
import { mockDB } from '../../../libs/mock-db'
import { officialProviderAliases, officialProviderAliasRoutes, officialTtsModels, officialTtsVoices } from '../../../schemas/official-catalog'
import { ApiError } from '../../../utils/error'

import * as schema from '../../../schemas'

describe('officialCatalogService', () => {
  let db: Database
  let service: ReturnType<typeof createOfficialCatalogService>

  beforeAll(async () => {
    db = await mockDB(schema)
    service = createOfficialCatalogService(db)
  })

  beforeEach(async () => {
    await db.delete(officialProviderAliasRoutes)
    await db.delete(officialProviderAliases)
    await db.delete(officialTtsVoices)
    await db.delete(officialTtsModels)
  })

  it('syncs the default LLM auto alias and runtime model routes as enabled', async () => {
    const aliases = await service.syncAliasesFromRouterConfig({
      surface: 'llm',
      modelIds: ['chat-b', 'chat-a'],
    })

    expect(aliases).toHaveLength(1)
    expect(aliases[0]).toMatchObject({
      surface: 'llm',
      aliasId: 'auto',
      displayName: 'Auto',
      enabled: true,
      fallbackEnabled: true,
      loadBalancingEnabled: false,
    })

    const resolved = await service.resolveEnabledAlias('llm', 'auto')
    expect(resolved.routes.map(route => route.routerModelId)).toEqual(['chat-b', 'chat-a'])
    expect(resolved.routes.every(route => route.enabled)).toBe(true)
    expect(resolved.routes.every(route => route.pool === 'primary')).toBe(true)
  })

  it('preserves alias and route curation across repeated syncs', async () => {
    await service.syncAliasesFromRouterConfig({ surface: 'llm', modelIds: ['chat-a'] })
    const [alias] = await db.select().from(officialProviderAliases)
    const [route] = await db.select().from(officialProviderAliasRoutes)

    await db.update(officialProviderAliases)
      .set({ enabled: false, displayName: 'Custom Auto', displayOrder: 5 })
      .where(eq(officialProviderAliases.id, alias.id))
    await db.update(officialProviderAliasRoutes)
      .set({ enabled: false, displayOrder: 9 })
      .where(eq(officialProviderAliasRoutes.id, route.id))

    await service.syncAliasesFromRouterConfig({ surface: 'llm', modelIds: ['chat-a', 'chat-b'] })
    const aliases = await service.listAliases('llm')
    const preservedRoute = aliases[0].routes.find(item => item.routerModelId === 'chat-a')
    const newRoute = aliases[0].routes.find(item => item.routerModelId === 'chat-b')

    expect(aliases[0]).toMatchObject({ enabled: false, displayName: 'Custom Auto', displayOrder: 5 })
    expect(preservedRoute).toMatchObject({ enabled: false, displayOrder: 9 })
    expect(newRoute).toMatchObject({ enabled: true, displayOrder: 1 })
  })

  it('syncs runtime TTS models as enabled but preserves admin display fields', async () => {
    const first = await service.syncTtsModelsFromRouterConfig({
      models: {
        'alibaba/cosyvoice-v2': { provider: 'dashscope-cosyvoice' },
      },
    })
    await db.update(officialTtsModels)
      .set({ enabled: false, displayName: 'Curated CosyVoice', displayOrder: 7 })
      .where(eq(officialTtsModels.id, first[0].id))

    await service.syncTtsModelsFromRouterConfig({
      models: {
        'alibaba/cosyvoice-v2': { provider: 'dashscope-cosyvoice' },
        'microsoft/v1': { provider: 'azure' },
      },
    })

    const models = await service.listTtsModels()
    expect(models.map(model => model.routerModelId)).toEqual(['alibaba/cosyvoice-v2', 'microsoft/v1'])
    expect(models.find(model => model.routerModelId === 'alibaba/cosyvoice-v2')).toMatchObject({
      enabled: false,
      displayName: 'Curated CosyVoice',
      displayOrder: 7,
      provider: 'dashscope-cosyvoice',
    })
    expect(models.find(model => model.routerModelId === 'microsoft/v1')).toMatchObject({
      enabled: true,
      displayName: 'microsoft/v1',
      provider: 'azure',
    })
  })

  it('syncs provider voices as disabled by default and preserves curation on resync', async () => {
    await service.syncTtsModelsFromRouterConfig({
      models: { 'microsoft/v1': { provider: 'azure' } },
    })

    const first = await service.syncTtsVoices({
      routerModelId: 'microsoft/v1',
      voices: [{
        id: 'en-US-AvaMultilingualNeural',
        name: 'Ava',
        languages: [{ code: 'en-US', title: 'English' }],
        labels: { gender: 'female' },
        previewAudioUrl: 'https://example.com/ava.mp3',
      }],
    })
    expect(first[0]).toMatchObject({
      providerVoiceId: 'en-US-AvaMultilingualNeural',
      displayName: 'Ava',
      enabled: false,
      previewAudioUrl: 'https://example.com/ava.mp3',
    })

    await db.update(officialTtsVoices)
      .set({
        enabled: true,
        displayName: 'Curated Ava',
        displayOrder: 3,
        previewAudioUrl: 'https://example.com/manual.mp3',
      })
      .where(eq(officialTtsVoices.id, first[0].id))

    await service.syncTtsVoices({
      routerModelId: 'microsoft/v1',
      voices: [{
        id: 'en-US-AvaMultilingualNeural',
        name: 'Ava from provider',
        languages: [{ code: 'en-US', title: 'English US' }],
        labels: { gender: 'Female' },
        previewAudioUrl: 'https://example.com/provider-new.mp3',
      }],
    })

    const voices = await service.listTtsVoices('microsoft/v1')
    expect(voices[0]).toMatchObject({
      enabled: true,
      displayName: 'Curated Ava',
      displayOrder: 3,
      previewAudioUrl: 'https://example.com/manual.mp3',
      labels: { gender: 'Female' },
      languages: [{ code: 'en-US', title: 'English US' }],
    })
  })

  it('lists and gates only enabled TTS models and voices', async () => {
    const [model] = await service.syncTtsModelsFromRouterConfig({
      models: { 'microsoft/v1': { provider: 'azure' } },
    })
    const [voice] = await service.syncTtsVoices({
      routerModelId: 'microsoft/v1',
      voices: [{ id: 'en-US-AvaMultilingualNeural', name: 'Ava' }],
    })

    expect(await service.listEnabledTtsModels()).toHaveLength(1)
    expect(await service.listEnabledTtsVoices('microsoft/v1')).toEqual([])

    await db.update(officialTtsVoices)
      .set({ enabled: true })
      .where(eq(officialTtsVoices.id, voice.id))
    expect((await service.listEnabledTtsVoices('microsoft/v1')).map(item => item.providerVoiceId)).toEqual(['en-US-AvaMultilingualNeural'])

    await db.update(officialTtsModels)
      .set({ enabled: false })
      .where(eq(officialTtsModels.id, model.id))

    await expect(service.assertTtsModelEnabled('microsoft/v1')).rejects.toMatchObject({
      errorCode: 'OFFICIAL_MODEL_DISABLED',
    })
    await expect(service.assertTtsVoiceEnabled('microsoft/v1', 'en-US-AvaMultilingualNeural')).rejects.toMatchObject({
      errorCode: 'OFFICIAL_MODEL_DISABLED',
    })
  })

  it('throws structured errors for missing or disabled aliases and voices', async () => {
    await expect(service.resolveEnabledAlias('llm', 'auto')).rejects.toMatchObject({
      errorCode: 'OFFICIAL_ALIAS_NOT_FOUND',
    })

    await service.syncAliasesFromRouterConfig({ surface: 'llm', modelIds: ['chat-a'] })
    const [alias] = await db.select().from(officialProviderAliases)
    await db.update(officialProviderAliases)
      .set({ enabled: false })
      .where(eq(officialProviderAliases.id, alias.id))

    await expect(service.resolveEnabledAlias('llm', 'auto')).rejects.toMatchObject({
      errorCode: 'OFFICIAL_ALIAS_DISABLED',
    })

    await service.syncTtsModelsFromRouterConfig({ models: { 'microsoft/v1': { provider: 'azure' } } })
    await expect(service.assertTtsVoiceEnabled('microsoft/v1', 'missing')).rejects.toBeInstanceOf(ApiError)
    await expect(service.assertTtsVoiceEnabled('microsoft/v1', 'missing')).rejects.toMatchObject({
      errorCode: 'OFFICIAL_VOICE_NOT_FOUND',
    })
  })
})
