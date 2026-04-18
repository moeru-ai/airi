import { ref } from 'vue'

const hearingStore = {
  activeTranscriptionProvider: ref(''),
  activeTranscriptionModel: ref(''),
}

const hearingPipelineStore = {
  supportsStreamInput: ref(true),
  error: ref(''),
  async transcribeForMediaStream() {},
  async stopStreamingTranscription() {},
}

export function useHearingStore() {
  return hearingStore
}

export function useHearingSpeechInputPipeline() {
  return hearingPipelineStore
}
