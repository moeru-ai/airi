import type { ProviderCatalogTtsModel } from '../../../../../schemas/provider-catalog'
import type { VoicePack } from '../../../../../schemas/voice-packs'
import type { V1RouteDeps } from '../../types'

import { useLogger } from '@guiiai/logg'
import { createBadGatewayError, createBadRequestError, createServiceUnavailableError } from '@proj-airi/http-shared'
import { ofetch } from 'ofetch'

import { catalogVoiceResponse } from '../../../../../services/domain/provider-catalog/provider-voices'

const VOICE_PACK_MODEL_ID = 'voice-pack'

/** A Voice Pack bills at the multiplier of its catalog model. A pack whose model is missing from the catalog cannot be requested. */
function voicePackCatalogVoice(pack: VoicePack, costMultiplier: number) {
  const cost = `Flux cost: ${costMultiplier}x`
  return {
    id: pack.voiceId,
    name: pack.name,
    description: pack.description ? `${pack.description} · ${cost}` : cost,
    labels: { type: 'voice_pack' },
    tags: ['voice_pack'],
    languages: [{ code: 'en', title: 'English' }],
  }
}

/** Names the price only when it differs from the base TTS price, so 1x models keep their plain name. */
function catalogModelDescription(model: ProviderCatalogTtsModel): string | undefined {
  const parts = [model.description, model.costMultiplier !== 1 ? `Flux cost: ${model.costMultiplier}x` : undefined]
    .filter((part): part is string => !!part)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

export interface SpeechCatalogOperation {
  listSpeechModels: () => Promise<Response>
  listStreamingSpeechModels: () => Promise<Response>
  listStreamingVoices: (input: ListStreamingVoicesInput) => Promise<Response>
  listVoices: (input: ListVoicesInput) => Promise<Response>
}

export interface ListStreamingVoicesInput {
  model?: string
}

export interface ListVoicesInput {
  requestedModel?: string
}

export function createSpeechCatalogOperation(deps: V1RouteDeps): SpeechCatalogOperation {
  const logger = useLogger('v1-completions').useGlobalConfig()

  async function listVoices(input: ListVoicesInput) {
    // Voice catalogs are per model. Operators edit the recommended map in configKV without a deploy.
    // An empty `?model=` is a client bug. It returns 400 and does not fall back to DEFAULT_TTS_MODEL.
    const requested = input.requestedModel
    if (requested === undefined || requested === '')
      throw createBadRequestError('audio voices: ?model= is required (use `auto` to defer to DEFAULT_TTS_MODEL)', 'MISSING_MODEL')

    const model = requested === 'auto'
      ? await deps.configKV.getOrThrow('DEFAULT_TTS_MODEL')
      : requested

    const voicePacks = await deps.voicePackService.listEnabled()
    if (model === VOICE_PACK_MODEL_ID) {
      const enabledModels = new Map((await deps.providerCatalogService.listEnabledTtsModels()).map(entry => [entry.routerModelId, entry]))
      const voices = voicePacks.flatMap((pack) => {
        const packModel = enabledModels.get(pack.ttsModelId)
        return packModel ? [voicePackCatalogVoice(pack, packModel.costMultiplier)] : []
      })
      logger.withFields({ model, voiceCount: voices.length, voicePackCount: voicePacks.length }).debug('list tts voices')
      return Response.json({ voices, recommended: {} })
    }

    const voices = await deps.providerCatalogService.listEnabledTtsVoices(model)
    const recommended = (await deps.configKV.getOptional('DEFAULT_TTS_VOICES'))?.[model] ?? {}
    // Debug level: high-frequency catalog poll from UI selectors, no
    // billing / user-facing side effect — useful only when debugging
    // voice-picker drift, never as a permanent audit trail line.
    logger.withFields({ model, voiceCount: voices.length, voicePackCount: voicePacks.length }).debug('list tts voices')
    return Response.json({ voices: voices.map(catalogVoiceResponse), recommended })
  }

  /**
   * Voice catalog for the streaming TTS provider (`/audio/speech/ws`).
   *
   * Errors propagate verbatim: missing config -> 503, malformed upstream
   * URL -> 502, unspeech network failure -> 502, unspeech non-2xx -> 502.
   * No empty-array fallback: the UI surfaces a real failure state.
   */
  async function listStreamingVoices(input: ListStreamingVoicesInput) {
    const unspeech = await deps.configKV.getOptional('UNSPEECH_UPSTREAM')
    if (!unspeech?.streaming?.baseURL)
      throw createServiceUnavailableError('streaming tts upstream not configured', 'STREAMING_TTS_NOT_CONFIGURED')

    // Pass through the api_resource_id (e.g. `seed-tts-2.0`). unspeech
    // filters the embedded Volcengine catalogue server-side; absent model
    // means "return everything streaming-safe".
    const model = input.model

    let voicesURL: string
    try {
      const u = new URL(unspeech.restBaseURL)
      u.pathname = '/api/voices'
      const params = new URLSearchParams({ provider: 'volcengine' })
      if (model)
        params.set('model', model)
      u.search = `?${params.toString()}`
      voicesURL = u.toString()
    }
    catch (err) {
      logger.withError(err).withFields({ restBaseURL: unspeech.restBaseURL }).warn('streaming-voices: bad UNSPEECH_UPSTREAM.restBaseURL')
      throw createBadGatewayError('UNSPEECH_UPSTREAM.restBaseURL is malformed')
    }

    let res: Awaited<ReturnType<typeof ofetch.raw>>
    try {
      res = await ofetch.raw(voicesURL, {
        ignoreResponseError: true,
        timeout: 5000,
      })
    }
    catch (err) {
      logger.withError(err).withFields({ voicesURL }).warn('streaming-voices: unspeech fetch failed')
      throw createBadGatewayError('streaming voices upstream fetch failed')
    }

    if (!res.ok) {
      let snippet = ''
      if (typeof res._data === 'string') {
        snippet = res._data
      }
      else if (res._data != null) {
        try {
          snippet = JSON.stringify(res._data)
        }
        catch {
          snippet = String(res._data)
        }
      }
      logger.withFields({ voicesURL, status: res.status, snippet: snippet.slice(0, 256) }).warn('streaming-voices: unspeech non-2xx')
      throw createBadGatewayError(`streaming voices upstream ${res.status}`, { lastStatusCode: res.status })
    }

    const data = res._data as { voices: unknown[] }
    if (!Array.isArray(data.voices))
      throw createBadGatewayError('streaming voices upstream missing voices[]')

    const recommended = model
      ? ((await deps.configKV.getOptional('DEFAULT_TTS_VOICES'))?.[model] ?? {})
      : {}
    return Response.json({ voices: data.voices, recommended })
  }

  async function listSpeechModels() {
    const defaultModel = await deps.configKV.getOrThrow('DEFAULT_TTS_MODEL')
    const models = await deps.providerCatalogService.listEnabledTtsModels()
    const publicDefaultModel = models.some(model => model.routerModelId === defaultModel)
      ? defaultModel
      : null
    return Response.json({
      models: [
        { id: VOICE_PACK_MODEL_ID, name: 'Voice Pack', description: 'Server-curated voices' },
        ...models.map(model => ({
          id: model.routerModelId,
          name: model.displayName,
          description: catalogModelDescription(model),
          costMultiplier: model.costMultiplier,
        })),
      ],
      default: publicDefaultModel,
    })
  }

  async function listStreamingSpeechModels() {
    const unspeech = await deps.configKV.getOptional('UNSPEECH_UPSTREAM')
    const models = unspeech?.streaming?.models ?? []
    // `available` is the operator-controlled visibility switch the client gates
    // the streaming provider on. It tracks whether `UNSPEECH_UPSTREAM.streaming`
    // is configured at all — not whether `models[]` happens to be empty — so an
    // operator who has wired the upstream but not yet curated models still
    // surfaces the provider rather than silently hiding it.
    return Response.json({
      available: !!unspeech?.streaming?.baseURL,
      models: models.map(m => ({
        id: m.id,
        name: m.name ?? m.id,
        description: m.description,
      })),
      default: unspeech?.streaming?.defaultModel ?? null,
    })
  }

  return {
    listSpeechModels,
    listStreamingSpeechModels,
    listStreamingVoices,
    listVoices,
  }
}
