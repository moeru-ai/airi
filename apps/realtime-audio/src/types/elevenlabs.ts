export interface ChunkLengthScheduleOptions {
  /**
   * This is an advanced setting that most users shouldn’t need to use.
   * It relates to our generation schedule.
   *
   * Our WebSocket service incorporates a buffer system designed to
   * optimize the Time To First Byte (TTFB) while maintaining high-quality
   * streaming.
   *
   * All text sent to the WebSocket endpoint is added to this buffer
   * and only when that buffer reaches a certain size is an audio
   * generation attempted. This is because our model provides higher
   * quality audio when the model has longer inputs, and can deduce more
   * context about how the text should be delivered.
   *
   * The buffer ensures smooth audio data delivery and is automatically
   * emptied with a final audio generation either when the stream is
   * closed, or upon sending a flush command. We have advanced settings
   * for changing the chunk schedule, which can improve latency at the
   * cost of quality by generating audio more frequently with smaller
   * text inputs.
   *
   * The chunk_length_schedule determines the minimum amount of text that
   * needs to be sent and present in our buffer before audio starts being
   * generated. This is to maximise the amount of context available to
   * the model to improve audio quality, whilst balancing latency of the
   * returned audio chunks.
   *
   * The default value for chunk_length_schedule is: [120, 160, 250, 290].
   *
   * This means that the first chunk of audio will not be generated until
   * you send text that totals at least 120 characters long. The next
   * chunk of audio will only be generated once a further 160 characters
   * have been sent. The third audio chunk will be generated after the
   * next 250 characters. Then the fourth, and beyond, will be generated
   * in sets of at least 290 characters.
   *
   * Customize this array to suit your needs. If you want to generate
   * audio more frequently to optimise latency, you can reduce the values
   * in the array. Note that setting the values too low may result in
   * lower quality audio. Please test and adjust as needed.
   *
   * Each item should be in the range 50-500.
   */
  chunk_length_schedule?: number[]
}

export interface PronunciationDictionaryLocatorOptions {
  /**
   * Optional list of pronunciation dictionary locators.
   *
   * If provided, these dictionaries will be used to modify pronunciation
   * of matching text. Must only be provided in the first message.
   *
   * Note: Pronunciation dictionary matches will only be respected
   * within a provided chunk.
   */
  pronunciation_dictionary_locators?: Array<{
    dictionary_id: string
    version_id: string
  }>
}

export interface VoiceSettings {
  /**
   * Defines the stability for voice settings.
   *
   * @default 0.5
   */
  stability?: number
  /**
   * Defines the similarity boost for voice settings.
   *
   * @default 0.75
   */
  similarity_boost?: number
  /**
   * Defines the style for voice settings. This parameter is
   * available on V2+ models.
   *
   * @default 0
   */
  style?: number
  /**
   * Defines the use speaker boost for voice settings. This parameter is
   * available on V2+ models.
   *
   * @default true
   */
  use_speaker_boost?: boolean
  /**
   * Controls the speed of the generated speech. Values range from 0.7
   * to 1.2, with 1.0 being the default speed.
   *
   * @default 1
   */
  speed?: number
}

export interface ElevenLabsWebSocketEventInitializeConnection {
  /**
   * The text to be sent to the API for audio generation. Should always
   * end with a single space string.
   */
  'text': string
  /**
   * The voice settings field can be provided in the first
   * InitializeConnection message and then must either be
   * not provided or not changed.
   */
  'voice_settings'?: VoiceSettings
  /**
   * The generator config field can be provided in the first
   * InitializeConnection message and then must either be not provided or
   * not changed.
   */
  'generator_config'?: ChunkLengthScheduleOptions & PronunciationDictionaryLocatorOptions
  /**
   * Your ElevenLabs API key. This can only be included in the first
   * message and is not needed if present in the header.
   */
  'xi-api-key'?: string
  /**
   * Your authorization bearer token. This can only be included in the
   * first message and is not needed if present in the header.
   */
  'authorization'?: string
}

export interface ElevenLabsWebSocketEventSendText {
  /**
   * The text to be sent to the API for audio generation. Should always
   * end with a single space string.
   */
  text: string
  /**
   * This is an advanced setting that most users shouldn’t need to use.
   * It relates to our generation schedule.
   *
   * Use this to attempt to immediately trigger the generation of audio,
   * overriding the chunk_length_schedule. Unlike flush,
   * try_trigger_generation will only generate audio if our buffer
   * contains more than a minimum threshold of characters, this is to
   * ensure a higher quality response from our model.
   *
   * Note that overriding the chunk schedule to generate small amounts of
   * text may result in lower quality audio, therefore, only use this
   * parameter if you really need text to be processed immediately. We
   * generally recommend keeping the default value of false and adjusting
   * the chunk_length_schedule in the generation_config instead.
   */
  try_trigger_generation?: boolean
  /**
   * The voice settings field can be provided in the first
   * InitializeConnection message and then must either be not
   * provided or not changed.
   */
  voice_settings?: VoiceSettings
  /**
   * The generator config field can be provided in the first
   * InitializeConnection message and then must either be not provided or
   * not changed.
   */
  generator_config?: ChunkLengthScheduleOptions
  /**
   * Flush forces the generation of audio. Set this value to true when you
   * have finished sending text, but want to keep the websocket connection
   * open.
   *
   * This is useful when you want to ensure that the last chunk of audio is
   * generated even when the length of text sent is smaller than the value
   * set in chunk_length_schedule (e.g. 120 or 50).
   *
   * @default false
   */
  flush?: boolean
}

export interface ElevenLabsWebSocketEventCloseConnection {
  /**
   * End the stream with an empty string
   */
  text: string
}

export interface ElevenLabsWebSocketEventAudioOutput {
  /**
   * A generated partial audio chunk, encoded using the selected output_format,
   * by default this is MP3 encoded as a base64 string.
   */
  audio: string
  /**
   * Alignment information for the generated audio given the input normalized text sequence.
   */
  normalizedAlignment?: {
    /**
     * A list of starting times (in milliseconds) for each character in the
     * normalized text as it corresponds to the audio. For instance, the
     * character ‘H’ starts at time 0 ms in the audio. Note these times are
     * relative to the returned chunk from the model, and not the full audio
     * response.
     */
    char_start_times_ms?: number[]
    /**
     * A list of durations (in milliseconds) for each character in the
     * normalized text as it corresponds to the audio. For instance, the
     * character ‘H’ lasts for 3 ms in the audio. Note these times are
     * relative to the returned chunk from the model, and not the full
     * audio response.
     */
    chars_durations_ms?: number[]
    /**
     * A list of characters in the normalized text sequence. For instance, the
     * first character is ‘H’. Note that this list may contain spaces,
     * punctuation, and other special characters. The length of this list should
     * be the same as the lengths of char_start_times_ms and chars_durations_ms.
     */
    chars?: string[]
  }
  /**
   * Alignment information for the generated audio given the input text sequence.
   */
  alignment?: {
    /**
     * A list of starting times (in milliseconds) for each character in the text
     * as it corresponds to the audio. For instance, the character ‘H’ starts at
     * time 0 ms in the audio. Note these times are relative to the returned
     * chunk from the model, and not the full audio response.
     */
    char_start_times_ms?: number[]
    /**
     * A list of durations (in milliseconds) for each character in the text as
     * it corresponds to the audio. For instance, the character ‘H’ lasts for 3
     * ms in the audio. Note these times are relative to the returned chunk from
     * the model, and not the full audio response.
     */
    chars_durations_ms?: number[]
    /**
     * A list of characters in the text sequence. For instance, the first character
     * is ‘H’. Note that this list may contain spaces, punctuation, and other
     * special characters. The length of this list should be the same as the
     * lengths of char_start_times_ms and chars_durations_ms.
     */
    chars?: string[]
  }
}

export interface ElevenLabsWebSocketEventFinalOutput {
  /**
   * Indicates if the generation is complete. If set to True, audio will be
   * null.
   */
  isFinal?: boolean
}
