import { ref } from 'vue'

const settingsStore = {
  stageModelRenderer: ref('mock-renderer'),
  stageModelSelected: ref('mock-model'),
  stageModelSelectedUrl: ref('/mock-model.vrm'),
  async updateStageModel() {},
}

const audioDeviceStore = {
  enabled: ref(false),
  selectedAudioInput: ref('mock-mic'),
  stream: ref<MediaStream | null>(null),
  audioInputs: ref([
    {
      label: 'Mock Mic',
      deviceId: 'mock-mic',
    },
  ]),
  async askPermission() {},
  startStream() {},
  stopStream() {},
}

export function useSettings() {
  return settingsStore
}

export function useSettingsAudioDevice() {
  return audioDeviceStore
}
