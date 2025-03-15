import type { UnSpeechOptions } from '@xsai-ext/providers-local'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { VoiceProviderWithExtraOptions } from './voice'

import { merge } from '@xsai-ext/shared-providers'
import { objCamelToSnake } from '@xsai/shared'

/** @see {@link https://elevenlabs.io/docs/api-reference/text-to-speech/convert#request} */
export interface UnElevenLabsOptions {
  /**
   * This parameter controls text normalization with three modes: 'auto', 'on', and 'off'. When set to 'auto',
   * the system will automatically decide whether to apply text normalization (e.g., spelling out numbers).
   * With 'on', text normalization will always be applied, while with 'off', it will be skipped. Cannot be
   * turned on for 'eleven_turbo_v2_5' model.
   */
  applyTextNormalization?: 'auto' | 'off' | 'on'
  /**
   * Language code (ISO 639-1) used to enforce a language for the model. Currently only Turbo v2.5
   * supports language enforcement. For other models, an error will be returned if language code is provided.
   */
  languageCode?: string
  /**
   * A list of request_id of the samples that were generated before this generation. Can
   * be used to improve the flow of prosody when splitting up a large task into multiple
   * requests. The results will be best when the same model is used across the generations.
   *
   * In case both next_text and next_request_ids is send, next_text will be ignored.
   * A maximum of 3 request_ids can be send.
   */
  nextRequestIds?: string[]
  /**
   * The text that comes after the text of the current request. Can be used to improve
   * the flow of prosody when concatenating together multiple generations or to influence
   * the prosody in the current generation.
   */
  nextText?: string
  /**
   * A list of request_id of the samples that were generated before this generation. Can be
   * used to improve the flow of prosody when splitting up a large task into multiple requests.
   * The results will be best when the same model is used across the generations. In case both
   * previous_text and previous_request_ids is send, previous_text will be ignored. A maximum
   * of 3 request_ids can be send.
   */
  previousRequestIds?: string[]
  /**
   * The text that came before the text of the current request. Can be used to improve the
   * flow of prosody when concatenating together multiple generations or to influence the
   * prosody in the current generation.
   */
  previousText?: string
  /**
   * A list of pronunciation dictionary locators (id, version_id) to be applied to the text.
   * They will be applied in order. You may have up to 3 locators per request
   */
  pronunciationDictionaryLocators?: {
    pronunciationDictionaryId: string
    versionId: string
  }[]
  /**
   * If specified, our system will make a best effort to sample deterministically, such that
   * repeated requests with the same seed and parameters should return the same result.
   * Determinism is not guaranteed. Must be integer between 0 and 4294967295.
   */
  seed?: number
  /**
   * Voice settings overriding stored settings for the given voice. They are applied only on the given request.
   */
  voiceSettings?: {
    /**
     * Determines how closely the AI should adhere to the original voice when attempting to replicate it.
     */
    similarityBoost: number
    /**
     * Controls the speed of the generated speech. Values range from 0.7 to 1.2, with 1.0 being the default
     * speed. Lower values create slower, more deliberate speech while higher values produce faster-paced
     * speech. Extreme values can impact the quality of the generated speech.
     *
     * @default 1.0
     */
    speed?: number
    /**
     * Determines how stable the voice is and the randomness between each generation. Lower values introduce
     * broader emotional range for the voice. Higher values can result in a monotonous voice with limited
     * emotion.
     */
    stability: number
    /**
     * Determines the style exaggeration of the voice. This setting attempts to amplify the style of the original
     * speaker. It does consume additional computational resources and might increase latency if set to anything
     * other than 0.
     *
     * @default 0
     */
    style?: number
    /**
     * This setting boosts the similarity to the original speaker. Using this setting requires a slightly higher
     * computational load, which in turn increases latency.
     *
     * @default true
     */
    useSpeakerBoost?: boolean
  }
}

/**
 * [ElevenLabs](https://elevenlabs.io/) provider for [UnSpeech](https://github.com/moeru-ai/unspeech)
 * only.
 *
 * [UnSpeech](https://github.com/moeru-ai/unspeech) is a open-source project that provides a
 * OpenAI-compatible audio & speech related API that can be used with various providers such
 * as ElevenLabs, Azure TTS, Google TTS, etc.
 *
 * @param apiKey - ElevenLabs API Key
 * @param baseURL - UnSpeech Instance URL
 * @returns SpeechProviderWithExtraOptions
 */
export function createUnElevenLabs(apiKey: string, baseURL = 'http://localhost:5933/v1/') {
  const toUnSpeechOptions = ({
    applyTextNormalization,
    languageCode,
    nextRequestIds,
    nextText,
    previousRequestIds,
    previousText,
    pronunciationDictionaryLocators,
    seed,
    voiceSettings,
  }: UnElevenLabsOptions): UnSpeechOptions => ({
    extraBody: objCamelToSnake({
      applyTextNormalization,
      languageCode,
      nextRequestIds,
      nextText,
      previousRequestIds,
      previousText,
      pronunciationDictionaryLocators: pronunciationDictionaryLocators
        ? pronunciationDictionaryLocators.map(pdl => objCamelToSnake(pdl))
        : undefined,
      seed,
      voiceSettings: voiceSettings != null
        ? objCamelToSnake(voiceSettings)
        : {
            similarityBoost: 0.75,
            stability: 0.5,
          },
    }),
  })

  const speechProvider: SpeechProviderWithExtraOptions<
    /** @see {@link https://elevenlabs.io/docs/developer-guides/models} */
    'eleven_english_sts_v2' | 'eleven_flash_v2' | 'eleven_flash_v2_5' | 'eleven_multilingual_sts_v2' | 'eleven_multilingual_v2',
    UnElevenLabsOptions
  > = {
    speech: (model, options) => ({
      ...(options ? toUnSpeechOptions(options) : {}),
      apiKey,
      baseURL,
      model: `elevenlabs/${model}`,
    }),
  }

  const voiceProvider: VoiceProviderWithExtraOptions<
    UnElevenLabsOptions
  > = {
    voice: (options) => {
      if (baseURL.endsWith('v1/')) {
        baseURL = baseURL.slice(0, -3)
      }
      else if (baseURL.endsWith('v1')) {
        baseURL = baseURL.slice(0, -2)
      }

      return {
        query: `provider=elevenlabs`,
        ...(options ? toUnSpeechOptions(options) : {}),
        apiKey,
        baseURL,
      }
    },
  }

  return merge(
    speechProvider,
    voiceProvider,
  )
}
