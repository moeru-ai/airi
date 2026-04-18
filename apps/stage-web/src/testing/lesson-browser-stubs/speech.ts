import { ref } from 'vue'

const speechStore = {
  activeSpeechProvider: ref('browser-speech-api'),
  activeSpeechVoiceId: ref('lesson-voice'),
}

export function useSpeechStore() {
  return speechStore
}
