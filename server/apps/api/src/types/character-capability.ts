// TODO: Implement the config for the character capability
export interface CharacterCapabilityConfig extends CharacterCapabilityBaseConfig {
  asr: {
    audio: string
  }
  llm: {
    model: string
    temperature: number
  }
  tts: {
    pitch: number
    speed: number
    ssml: string
    voiceId: string
  }
  vlm: {
    image: string
  }
}

interface CharacterCapabilityBaseConfig {
  apiBaseUrl: string
  apiKey: string
}
