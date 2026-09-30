<script setup lang="ts">
import { useHostMicrophonePermission } from '@proj-airi/stage-host-context'
import { HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { useAudioAnalyzer, useAudioContextFromStream } from '@proj-airi/stage-ui/composables'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'

const show = defineModel('show', { type: Boolean, default: false })

const hearingStore = useHearingStore()
const settingsAudioDeviceStore = useSettingsAudioDevice()
const { autoSendEnabled } = storeToRefs(hearingStore)
const { enabled, stream } = storeToRefs(settingsAudioDeviceStore)

const microphonePermission = useHostMicrophonePermission()

async function prepareMicrophoneInput() {
  // Only an explicit enable action clears a refusal. Automatic requests retain the host decision.
  if (await microphonePermission.refresh() === 'denied')
    await microphonePermission.reset()
}

const { audioContext, initialize, dispose, pause } = useAudioContextFromStream(stream)
const { volumeLevel, startAnalyzer, stopAnalyzer } = useAudioAnalyzer()

// useSettingsAudioDevice owns the microphone stream. A second stream owner interrupted transcription after microphone toggles.
// This component observes that stream and owns only the analyzer lifecycle.
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
    v-model:auto-send="autoSendEnabled"
    :before-enable="prepareMicrophoneInput"
    :volume-level="volumeLevel"
  >
    <slot />
  </HearingConfigDialog>
</template>
