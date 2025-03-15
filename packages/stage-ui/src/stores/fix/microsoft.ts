import type { UnSpeechOptions } from '@xsai-ext/providers-local'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { VoiceProviderWithExtraOptions } from './voice'

import { merge } from '@xsai-ext/shared-providers'
import { objCamelToSnake } from '@xsai/shared'

export type MicrosoftRegions =
  | 'australiaeast'
  | 'brazilsouth'
  | 'canadacentral'
  | 'centralindia'
  | 'centralus'
  | 'eastasia'
  | 'eastus2'
  | 'eastus'
  | 'francecentral'
  | 'germanywestcentral'
  | 'japaneast'
  | 'japanwest'
  | 'jioindiawest'
  | 'koreacentral'
  | 'northcentralus'
  | 'northeurope'
  | 'norwayeast'
  | 'southcentralus'
  | 'southeastasia'
  | 'swedencentral'
  | 'switzerlandnorth'
  | 'switzerlandwest'
  | 'uaenorth'
  | 'uksouth'
  | 'usgovarizona'
  | 'usgovvirginia'
  | 'westcentralus'
  | 'westeurope'
  | 'westus2'
  | 'westus3'
  | 'westus'

export interface UnMicrosoftOptionAutoSSML {
  gender:
    | 'Female'
    | 'Male'
    | 'Neutral'
    | string
  lang:
    | 'en-US'
    | string
  /**
   * Speech Studio - Voice Gallery
   * https://speech.microsoft.com/portal/018ba84135d64cf79106cc99c75ffa6a/voicegallery
   */
  voice:
    | 'en-US-AndrewMultilingualNeural'
    | 'en-US-AriaNeural'
    | 'en-US-AvaMultilingualNeural'
    | 'en-US-BrianMultilingualNeural'
    | 'en-US-ChristopherMultilingualNeural'
    | 'en-US-EmmaMultilingualNeural'
    | 'en-US-JaneNeural'
    | string
}

export interface UnMicrosoftOptionCommon {
  /**
   * Text to speech API reference (REST) - Speech service - Azure AI services | Microsoft Learn
   * https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech?tabs=streaming#custom-neural-voices
   */
  deploymentId?: string
  /**
   * Text to speech API reference (REST) - Speech service - Azure AI services | Microsoft Learn
   * https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech?tabs=streaming#prebuilt-neural-voices
   *
   * NOTICE: Voices in preview are available in only these three regions: East US, West Europe, and Southeast Asia.
   */
  region: MicrosoftRegions | string
  sampleRate?:
    | 8000
    | 16000
    | 22050
    | 24000
    | 44100
    | 48000
    | number
}

export interface UnMicrosoftOptionCustomSSML {
  /**
   * By default, unspeech service will help you automatically convert OpenAI style plain text input
   * into SSML with lang, gender, voice parameters, but if you ever wanted to provide your own SSML
   * with all customizable parameters, you can set this option to `true` to disable the automatic
   * conversion and use your own SSML instead.
   *
   * About SSML (Speech Synthesis Markup Language), @see {@link https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup}
   */
  disableSsml?: boolean
}

/** @see {@link https://elevenlabs.io/docs/api-reference/text-to-speech/convert#request} */
export type UnMicrosoftOptions = (UnMicrosoftOptionAutoSSML | UnMicrosoftOptionCustomSSML) & UnMicrosoftOptionCommon

/**
 * [Microsoft / Azure AI](https://speech.microsoft.com/portal) provider for [UnSpeech](https://github.com/moeru-ai/unspeech)
 * only.
 *
 * [UnSpeech](https://github.com/moeru-ai/unspeech) is a open-source project that provides a
 * OpenAI-compatible audio & speech related API that can be used with various providers such
 * as ElevenLabs, Azure TTS, Google TTS, etc.
 *
 * @param apiKey - Microsoft / Azure AI subscription key
 * @param baseURL - UnSpeech Instance URL
 * @returns SpeechProviderWithExtraOptions
 */
export function createUnMicrosoft(apiKey: string, baseURL = 'http://localhost:5933/v1/') {
  const toUnSpeechOptions = (options: UnMicrosoftOptions): UnSpeechOptions => {
    const { deploymentId, region, sampleRate } = options

    const extraBody: Record<string, unknown> = {
      deploymentId,
      region,
      sampleRate,
    }

    if ('disableSsml' in options) {
      extraBody.disableSsml = options.disableSsml
    }
    else if ('lang' in options) {
      extraBody.lang = options.lang
      extraBody.gender = options.gender
      extraBody.voice = options.voice
    }

    return { extraBody: objCamelToSnake(extraBody) }
  }

  const speechProvider: SpeechProviderWithExtraOptions<
    /** @see Currently, cognitive services are on v1 */
    'microsoft/v1',
    UnMicrosoftOptions
  > = {
    speech: (model, options) => ({
      ...(options ? toUnSpeechOptions(options) : {}),
      apiKey,
      baseURL,
      model: `microsoft/${model}`,
    }),
  }

  const voiceProvider: VoiceProviderWithExtraOptions<
    UnMicrosoftOptions
  > = {
    voice: (options) => {
      if (baseURL.endsWith('v1/')) {
        baseURL = baseURL.slice(0, -3)
      }
      else if (baseURL.endsWith('v1')) {
        baseURL = baseURL.slice(0, -2)
      }

      return {
        query: `region=${options?.region}&provider=microsoft`,
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
