<script setup lang="ts">
import { electron } from '@proj-airi/electron-eventa'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { useAudioAnalyzer, useAudioContextFromStream } from '@proj-airi/stage-ui/composables'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useAsyncState } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'

const show = defineModel('show', { type: Boolean, default: false })

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { enabled, selectedAudioInput, stream, audioInputs } = storeToRefs(settingsAudioDeviceStore)

const getMediaAccessStatus = useElectronEventaInvoke(electron.systemPreferences.getMediaAccessStatus)
const { state: mediaAccessStatus, execute: refreshMediaAccessStatus } = useAsyncState(() => getMediaAccessStatus(['microphone']), 'not-determined')

const { audioContext, initialize, dispose, pause } = useAudioContextFromStream(stream)
const { volumeLevel, startAnalyzer, stopAnalyzer } = useAudioAnalyzer()

// NOTICE: Do not call `startStream()` / `stopStream()` from this component.
//
// `useSettingsAudioDevice()` already owns the mic stream lifecycle via the persisted `enabled` state.
// We previously toggled the stream here as well, which introduced a second lifecycle controller: the
// dialog could recreate the MediaStream while the page-level transcription pipeline still believed
// the old session was active.
//
// That produced the "VAD still works, but no transcript arrives" failure after retoggling the mic.
//
// This component should only react to the current stream to drive analyzer UI state.
watch([enabled, stream], ([isEnabled, currentStream]) => {
  if (isEnabled && currentStream) {
    initialize().then(() => {
      if (audioContext.value)
        return startAnalyzer(audioContext.value)
    })
  }
  else {
    stopAnalyzer()
    pause()
  }
}, { immediate: true })

onMounted(async () => {
  await refreshMediaAccessStatus()
  if (audioContext.value) {
    await startAnalyzer(audioContext.value)
  }
})

onUnmounted(async () => {
  await stopAnalyzer()
  await dispose()
})
</script>

<template>
  <HearingConfigDialog
    v-model:show="show"
    v-model:enabled="enabled"
    v-model:selected-audio-input="selectedAudioInput"
    :granted="mediaAccessStatus !== 'denied' && mediaAccessStatus !== 'restricted'"
    :audio-inputs="audioInputs"
    :volume-level="volumeLevel"
  >
    <slot />
  </HearingConfigDialog>
</template>
