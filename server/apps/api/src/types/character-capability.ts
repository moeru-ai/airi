interface CharacterCapabilityBaseConfig {
  apiKey: string
  apiBaseUrl: string
}

// TODO: Implement the config for the character capability
export interface CharacterCapabilityConfig extends CharacterCapabilityBaseConfig {
  llm: {
    temperature: number
    model: string
  }
  tts: {
    ssml: string
    voiceId: string
    speed: number
    pitch: number
  }
  vlm: {
    image: string
  }
  asr: {
    audio: string
  }
}
