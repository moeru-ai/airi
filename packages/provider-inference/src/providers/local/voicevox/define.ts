import type { ProviderDefinition, VoiceInfo } from '../../../types'
import type { VoicevoxSynthesisParameters } from './engine'

import { errorMessageFrom } from '@moeru/std'
import { z } from 'zod'

import { defineProvider } from '../../registry'
import { fetchEngineVersion, fetchSpeakers, synthesizeSpeech } from './engine'

/**
 * How long the reachability check waits before it calls the engine unreachable.
 *
 * A local engine answers `/version` at once after it starts. A longer wait only
 * delays the settings page.
 */
const REACHABILITY_TIMEOUT_MS = 5_000

/**
 * How often the reachability check runs again. Ollama and LM Studio declare the
 * same interval.
 *
 * No code starts that loop. `startPeriodicRuntimeValidation` reads the schedule,
 * only `refreshListedProviderValidation` calls it, and only
 * `resetProviderSettings` calls that.
 *
 * The provider therefore reaches an engine that starts later only when the user
 * reopens the settings page, or edits the Base URL.
 */
const REACHABILITY_INTERVAL_MS = 15_000

/**
 * The engine has no model concept. The speech module treats an empty model
 * selection as unconfigured, so the catalogue publishes one entry with a stable
 * id. The user gets no choice between alternatives that do not exist.
 */
const SYNTHETIC_MODEL_ID = 'default'

/**
 * `generateSpeech` builds a URL from this before it calls the injected `fetch`.
 * The adapter ignores the URL, so the value only has to parse.
 */
const SENTINEL_BASE_URL = 'http://voicevox-family.invalid/v1/'

const voicevoxVoiceSettingsSchema = z.object({
  intonation: z.number().default(1),
  pitch: z.number().default(0),
  speed: z.number().default(1),
  volume: z.number().default(1),
})

export type VoicevoxFamilyConfig = z.input<ReturnType<typeof createVoicevoxConfigSchema>>

export interface VoicevoxFamilyProviderOptions<TId extends string = string> {
  /** Prefilled Base URL, and the address the validator names when the field is empty. */
  defaultBaseUrl: string
  /** Fallback description, shown when the locale has no entry. */
  description: string
  id: TId
  /** Fallback name, shown when the locale has no entry. */
  name: string
}

/**
 * Builds one catalogue entry for an engine that implements the VOICEVOX HTTP API.
 *
 * `createProvider` returns an injected `fetch`, so synthesis never sends the
 * OpenAI-shaped request that `generateSpeech` builds. {@link synthesizeSpeech}
 * makes the two engine requests instead.
 */
export function defineVoicevoxFamilyProvider<const TId extends string>(
  options: VoicevoxFamilyProviderOptions<TId>,
): ProviderDefinition<VoicevoxFamilyConfig, TId> {
  const configSchema = createVoicevoxConfigSchema(options.defaultBaseUrl)

  return defineProvider<VoicevoxFamilyConfig, TId>({
    createProvider(config) {
      return {
        speech: () => ({
          baseURL: SENTINEL_BASE_URL,
          fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
            const { input, voice } = readSpeechRequest(init)
            const wav = await synthesizeSpeech(
              config.baseUrl ?? options.defaultBaseUrl,
              {
                parameters: config.voiceSettings as undefined | VoicevoxSynthesisParameters,
                styleId: voice,
                text: input,
              },
              { signal: init?.signal ?? undefined },
            )

            return new Response(wav, { headers: { 'Content-Type': 'audio/wav' }, status: 200 })
          },
          model: SYNTHETIC_MODEL_ID,
        }),
      }
    },
    createProviderConfig: () => configSchema,
    description: options.description,
    descriptionLocalize: ({ t }) => t(`settings.pages.providers.provider.${options.id}.description`),
    extraMethods: {
      listModels: async () => [{
        contextLength: 0,
        deprecated: false,
        description: '',
        id: SYNTHETIC_MODEL_ID,
        name: options.name,
        provider: options.id,
      }],

      listVoices: async (config) => {
        const speakers = await fetchSpeakers(config.baseUrl?.trim() ?? '')
        return speakers.flatMap(speaker => (speaker.styles ?? []).map(style => toVoiceInfo(options.id, speaker.name, style)))
      },
    },
    icon: 'i-lobe-icons:speaker',
    id: options.id,
    name: options.name,

    nameLocalize: ({ t }) => t(`settings.pages.providers.provider.${options.id}.title`),

    tasks: ['text-to-speech'],

    validationRequiredWhen: config => Boolean(config.baseUrl?.trim()),

    validators: {
      validateConfig: [
        ({ t }) => ({
          id: `${options.id}:check-config`,
          name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
          validator: async (config) => {
            const reason = absoluteUrlError(config.baseUrl?.trim() ?? '', options.defaultBaseUrl)
            if (reason)
              return { errors: [{ error: new Error(reason) }], reason, reasonKey: '', valid: false }

            return { errors: [], reason: '', reasonKey: '', valid: true }
          },
        }),
      ],
      // The reachability probe belongs here, not in `validateConfig`.
      // `getProviderValidationIntervalMs` reads schedules only from
      // `validateProvider`. A schedule declared on `validateConfig` never runs.
      validateProvider: [
        ({ t }) => ({
          id: `${options.id}:check-reachability`,
          name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
          schedule: {
            intervalMs: REACHABILITY_INTERVAL_MS,
            mode: 'interval',
          },
          validator: async (config) => {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS)
            try {
              await fetchEngineVersion(config.baseUrl?.trim() ?? '', { signal: controller.signal })
              return { errors: [], reason: '', reasonKey: '', valid: true }
            }
            catch (error) {
              const reason = `Cannot reach the speech engine: ${errorMessageFrom(error) ?? 'Unknown error'}\n\nMake sure the engine is running and that the Base URL matches its port.`
              return { errors: [{ error }], reason, reasonKey: '', valid: false }
            }
            finally {
              clearTimeout(timeout)
            }
          },
        }),
      ],
    },
  })
}

function absoluteUrlError(baseUrl: string, defaultBaseUrl: string) {
  if (!baseUrl)
    return `Base URL is required. Default to ${defaultBaseUrl} for this engine.`

  try {
    const url = new URL(baseUrl)
    // Check the scheme as well as the host. `ftp://engine/` parses and has a
    // host, so a host-only check accepts an address `fetch` cannot use, and then
    // asks the user for a scheme they already gave.
    if (!url.host || (url.protocol !== 'http:' && url.protocol !== 'https:'))
      return 'Base URL is not absolute. Try to include a scheme (http:// or https://).'
  }
  catch {
    return 'Base URL is not absolute. Try to include a scheme (http:// or https://).'
  }

  return ''
}

function createVoicevoxConfigSchema(defaultBaseUrl: string) {
  return z.object({
    baseUrl: z.string().default(defaultBaseUrl),
    voiceSettings: voicevoxVoiceSettingsSchema.default({ intonation: 1, pitch: 0, speed: 1, volume: 1 }),
  })
}

/**
 * Reads the segment text and the style id out of the OpenAI-shaped body that
 * `generateSpeech` builds.
 *
 * `requestBody` in `@xsai/shared` passes that object through `objCamelToSnake`.
 * Only single-word keys survive unchanged, and `input` and `voice` are two of
 * them. A key of more than one word arrives renamed. The synthesis parameters
 * therefore come from the provider configuration, not from this body.
 */
function readSpeechRequest(init: RequestInit | undefined): { input: string, voice: string } {
  if (!init?.body || typeof init.body !== 'string')
    throw new Error('Invalid speech request body')

  const body = JSON.parse(init.body) as { input?: string, voice?: string }
  if (!body.voice)
    throw new Error('No voice selected. Pick a character in the speech settings.')

  return { input: body.input ?? '', voice: body.voice }
}

function toVoiceInfo(providerId: string, speakerName: string, style: { id: number, name: string }): VoiceInfo {
  return {
    id: String(style.id),
    languages: [{ code: 'ja', title: 'Japanese' }],
    name: `${speakerName} / ${style.name}`,
    provider: providerId,
  }
}
