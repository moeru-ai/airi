export type OptimizeStreamingLatency =
/**
 * Default mode (no latency optimizations)
 */
  '0'
/**
 * Normal latency optimizations (about 50% of possible latency improvement of option 3)
 */
  | '1'
/**
 * Strong latency optimizations (about 75% of possible latency improvement of option 3)
 */
  | '2'
/**
 * Max latency optimizations
 */
  | '3'
/**
 * Max latency optimizations, but also with text normalizer turned off for even more latency savings (best latency, but can mispronounce eg numbers and dates).
 */
  | '4'

export type OutputFormat =
/**
 * Output format, mp3 with 22.05kHz sample rate at 32kbps
 */
  'mp3_22050_32'
/**
 * Output format, mp3 with 44.1kHz sample rate at 32kbps
 */
  | 'mp3_44100_32'
/**
 * Output format, mp3 with 44.1kHz sample rate at 64kbps
 */
  | 'mp3_44100_64'
/**
 * Output format, mp3 with 44.1kHz sample rate at 96kbps
 */
  | 'mp3_44100_96'
/**
 * Default output format, mp3 with 44.1kHz sample rate at 128kbps
 */
  | 'mp3_44100_128'
/**
 * Output format, mp3 with 44.1kHz sample rate at 192kbps.
 */
  | 'mp3_44100_192'
/**
 * PCM format (S16LE) with 16kHz sample rate.
 */
  | 'pcm_16000'
/**
 * PCM format (S16LE) with 22.05kHz sample rate.
 */
  | 'pcm_22050'
/**
 * PCM format (S16LE) with 24kHz sample rate.
 */
  | 'pcm_24000'
/**
 * PCM format (S16LE) with 44.1kHz sample rate. Requires you to be subscribed to Independent Publisher tier or above.
 */
  | 'pcm_44100'
/**
 * μ-law format (sometimes written mu-law, often approximated as u-law) with 8kHz sample rate. Note that this format is commonly used for Twilio audio inputs.
 */
  | 'ulaw_8000'

export interface VoiceSettings {
  stability?: number
  similarity_boost?: number
  style?: number
  use_speaker_boost?: boolean
}

export interface PronunciationDictionaryVersionLocator {
  pronunciation_dictionary_id: string
  version_id: string
}

/**
 * This parameter controls text normalization with three modes: 'auto', 'on', and 'off'. When set to 'auto', the system will automatically decide whether to apply text normalization (e.g., spelling out numbers). With 'on', text normalization will always be applied, while with 'off', it will be skipped. Cannot be turned on for 'eleven_turbo_v2_5' model.
 */
export type BodyTextToSpeechV1TextToSpeechVoiceIdPostApplyTextNormalization = 'auto' | 'on' | 'off'

/**
 * This parameter controls text normalization with three modes: 'auto', 'on', and 'off'. When set to 'auto', the system will automatically decide whether to apply text normalization (e.g., spelling out numbers). With 'on', text normalization will always be applied, while with 'off', it will be skipped. Cannot be turned on for 'eleven_turbo_v2_5' model.
 */
export type BodyTextToSpeechStreamingWithTimestampsV1TextToSpeechVoiceIdStreamWithTimestampsPostApplyTextNormalization = 'auto' | 'on' | 'off'

export interface TextToSpeechRequest {
  /**
   * When enable_logging is set to false full privacy mode will be used for the request. This will mean history features are unavailable for this request, including request stitching. Full privacy mode may only be used by enterprise customers.
   */
  enable_logging?: boolean
  /**
   * You can turn on latency optimizations at some cost of quality. The best possible final latency varies by model.
   */
  optimize_streaming_latency?: OptimizeStreamingLatency
  /**
   * The output format of the generated audio.
   */
  output_format?: OutputFormat
  /** The text that will get converted into speech. */
  text: string
  /** Identifier of the model that will be used, you can query them using GET /v1/models. The model needs to have support for text to speech, you can check this using the can_do_text_to_speech property. */
  model_id?: string
  /** Language code (ISO 639-1) used to enforce a language for the model. Currently only Turbo v2.5 supports language enforcement. For other models, an error will be returned if language code is provided. */
  language_code?: string
  /** Voice settings overriding stored setttings for the given voice. They are applied only on the given request. */
  voice_settings?: VoiceSettings
  /** A list of pronunciation dictionary locators (id, version_id) to be applied to the text. They will be applied in order. You may have up to 3 locators per request */
  pronunciation_dictionary_locators?: PronunciationDictionaryVersionLocator[]
  /** If specified, our system will make a best effort to sample deterministically, such that repeated requests with the same seed and parameters should return the same result. Determinism is not guaranteed. Must be integer between 0 and 4294967295. */
  seed?: number
  /** The text that came before the text of the current request. Can be used to improve the flow of prosody when concatenating together multiple generations or to influence the prosody in the current generation. */
  previous_text?: string
  /** The text that comes after the text of the current request. Can be used to improve the flow of prosody when concatenating together multiple generations or to influence the prosody in the current generation. */
  next_text?: string
  /** A list of request_id of the samples that were generated before this generation. Can be used to improve the flow of prosody when splitting up a large task into multiple requests. The results will be best when the same model is used across the generations. In case both previous_text and previous_request_ids is send, previous_text will be ignored. A maximum of 3 request_ids can be send. */
  previous_request_ids?: string[]
  /** A list of request_id of the samples that were generated before this generation. Can be used to improve the flow of prosody when splitting up a large task into multiple requests. The results will be best when the same model is used across the generations. In case both next_text and next_request_ids is send, next_text will be ignored. A maximum of 3 request_ids can be send. */
  next_request_ids?: string[]
  /** If true, we won't use PVC version of the voice for the generation but the IVC version. This is a temporary workaround for higher latency in PVC versions. */
  use_pvc_as_ivc?: boolean
  /** This parameter controls text normalization with three modes: 'auto', 'on', and 'off'. When set to 'auto', the system will automatically decide whether to apply text normalization (e.g., spelling out numbers). With 'on', text normalization will always be applied, while with 'off', it will be skipped. Cannot be turned on for 'eleven_turbo_v2_5' model. */
  apply_text_normalization?: BodyTextToSpeechV1TextToSpeechVoiceIdPostApplyTextNormalization
}

/**
 * @example
 *     {
 *         optimize_streaming_latency: "0",
 *         output_format: "mp3_22050_32",
 *         text: "It sure does, Jackie\u2026 My mama always said: \u201CIn Carolina, the air's so thick you can wear it!\u201D",
 *         voice_settings: {
 *             stability: 0.1,
 *             similarity_boost: 0.3,
 *             style: 0.2
 *         }
 *     }
 */
export interface StreamTextToSpeechRequest {
  /**
   * When enable_logging is set to false full privacy mode will be used for the request. This will mean history features are unavailable for this request, including request stitching. Full privacy mode may only be used by enterprise customers.
   */
  enable_logging?: boolean
  /**
   * You can turn on latency optimizations at some cost of quality. The best possible final latency varies by model.
   */
  optimize_streaming_latency?: OptimizeStreamingLatency
  /**
   * The output format of the generated audio.
   */
  output_format?: OutputFormat
  /** The text that will get converted into speech. */
  text: string
  /** Identifier of the model that will be used, you can query them using GET /v1/models. The model needs to have support for text to speech, you can check this using the can_do_text_to_speech property. */
  model_id?: string
  /** Language code (ISO 639-1) used to enforce a language for the model. Currently only Turbo v2.5 supports language enforcement. For other models, an error will be returned if language code is provided. */
  language_code?: string
  /** Voice settings overriding stored setttings for the given voice. They are applied only on the given request. */
  voice_settings?: VoiceSettings
  /** A list of pronunciation dictionary locators (id, version_id) to be applied to the text. They will be applied in order. You may have up to 3 locators per request */
  pronunciation_dictionary_locators?: PronunciationDictionaryVersionLocator[]
  /** If specified, our system will make a best effort to sample deterministically, such that repeated requests with the same seed and parameters should return the same result. Determinism is not guaranteed. Must be integer between 0 and 4294967295. */
  seed?: number
  /** The text that came before the text of the current request. Can be used to improve the flow of prosody when concatenating together multiple generations or to influence the prosody in the current generation. */
  previous_text?: string
  /** The text that comes after the text of the current request. Can be used to improve the flow of prosody when concatenating together multiple generations or to influence the prosody in the current generation. */
  next_text?: string
  /** A list of request_id of the samples that were generated before this generation. Can be used to improve the flow of prosody when splitting up a large task into multiple requests. The results will be best when the same model is used across the generations. In case both previous_text and previous_request_ids is send, previous_text will be ignored. A maximum of 3 request_ids can be send. */
  previous_request_ids?: string[]
  /** A list of request_id of the samples that were generated before this generation. Can be used to improve the flow of prosody when splitting up a large task into multiple requests. The results will be best when the same model is used across the generations. In case both next_text and next_request_ids is send, next_text will be ignored. A maximum of 3 request_ids can be send. */
  next_request_ids?: string[]
  /** If true, we won't use PVC version of the voice for the generation but the IVC version. This is a temporary workaround for higher latency in PVC versions. */
  use_pvc_as_ivc?: boolean
  /** This parameter controls text normalization with three modes: 'auto', 'on', and 'off'. When set to 'auto', the system will automatically decide whether to apply text normalization (e.g., spelling out numbers). With 'on', text normalization will always be applied, while with 'off', it will be skipped. Cannot be turned on for 'eleven_turbo_v2_5' model. */
  apply_text_normalization?: BodyTextToSpeechStreamingWithTimestampsV1TextToSpeechVoiceIdStreamWithTimestampsPostApplyTextNormalization
}

export interface GenerateAudioBulk extends TextToSpeechRequest {
}

export interface GenerateAudioStream extends StreamTextToSpeechRequest {
  stream: true
}

/**
 * Generates audio for a voice.
 *
 * @example Generate the entire audio
 * import { play } from "elevenlabs";
 *
 * const audio = eleven.generate({
 *   voiceId: "George" // defaults to Bella
 * })
 * await play(audio);
 *
 * @example
 * import { stream } from "elevenlabs"
 *
 * const audioStream = eleven.generate({
 *   stream: true,
 *   voice: "Bella"
 * })
 * await stream(audioStream);
 */
export type GenerateOptions = (GenerateAudioBulk & { voice?: string }) | (GenerateAudioStream & { voice?: string })
