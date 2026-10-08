<script setup lang="ts">
import { HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { useAudioAnalyzer, useAudioContextFromStream } from '@proj-airi/stage-ui/composables'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { storeToRefs } from 'pinia'
import { onUnmounted, watch } from 'vue'

const show = defineModel('show', { type: Boolean, default: false })

const hearingStore = useHearingStore()
const settingsAudioDeviceStore = useSettingsAudioDevice()
const { autoSendEnabled } = storeToRefs(hearingStore)
const { enabled, stream } = storeToRefs(settingsAudioDeviceStore)

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
watch([enabled, stream], async ([isEnabled, currentStream], _, onCleanup) => {
  let cancelled = false
  let source: MediaStreamAudioSourceNode | undefined
  onCleanup(() => {
    cancelled = true
    source?.disconnect()
    stopAnalyzer()
    pause()
  })

  if (!isEnabled || !currentStream)
    return

  await initialize()
  const context = audioContext.value
  if (cancelled || !context)
    return

  await context.resume()
  if (cancelled)
    return

  const analyzer = startAnalyzer(context)
  if (!analyzer)
    return

  // An unconnected analyzer writes silence into the shared microphone meter.
  source = context.createMediaStreamSource(currentStream)
  source.connect(analyzer)
}, { immediate: true })

onUnmounted(async () => {
  await stopAnalyzer()
  await dispose()
})
</script>

<template>
  <HearingConfigDialog
    v-model:show="show"
    v-model:auto-send="autoSendEnabled"
    :volume-level="volumeLevel"
  >
    <slot />
  </HearingConfigDialog>
</template>
