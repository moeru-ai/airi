<script setup lang="ts">
import { HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { useAudioAnalyzer, useAudioContextFromStream } from '@proj-airi/stage-ui/composables'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useAsyncState } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'

import { electron } from '../../../../shared/electron'
import { useElectronEventaInvoke } from '../../../composables/electron-vueuse/use-electron-eventa-context'

const show = defineModel('show', { type: Boolean, default: false })

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { enabled, selectedAudioInput, stream, audioInputs } = storeToRefs(settingsAudioDeviceStore)
const { startStream, stopStream } = settingsAudioDeviceStore

const getMediaAccessStatus = useElectronEventaInvoke(electron.systemPreferences.getMediaAccessStatus)
const { state: mediaAccessStatus, execute: refreshMediaAccessStatus } = useAsyncState(() => getMediaAccessStatus(['microphone']), 'not-determined')

const { audioContext, initialize, dispose, pause } = useAudioContextFromStream(stream)
const { volumeLevel, startAnalyzer, stopAnalyzer } = useAudioAnalyzer()

watch(enabled, (val) => {
  if (val) {
    startStream()
    initialize().then(() => startAnalyzer(audioContext.value!))
  }
  else {
    stopStream()
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
