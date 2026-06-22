<script setup lang="ts">
import { Button, Callout, FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useAudioAnalyzer, useAudioDevice } from '../../../../composables'
import { useSettingsAudioDevice } from '../../../../stores'
import { useHearingStore } from '../../../../stores/modules/hearing'

// NOTICE: The "Transcription" toggle button stays removed (recording is driven by push-to-talk /
// VAD, not a manual transcription toggle here). The "Auto send" toggle is restored, but it only
// governs continuous-listening (VAD) auto-send and is hidden in push-to-talk mode, where the key
// release is itself the send intent so auto-send does not apply.
//
// Visibility is gated by an explicit `showAutoSend` prop, NOT by `autoSend !== undefined`: a
// `defineModel<boolean>` whose `v-model:auto-send` is unbound is Boolean-coerced to `false` (not
// undefined) by Vue, so a `!== undefined` guard would render a dead toggle in consumers that don't
// bind it (e.g. the desktop HearingConfigDialog). Only ChatArea opts in via `:show-auto-send`.
const props = withDefaults(defineProps<{
  granted?: boolean // permission status on OS level
  showAutoSend?: boolean // opt-in: render the auto-send toggle (consumers that bind v-model:auto-send)
}>(), {
  granted: false,
  showAutoSend: false,
})

const autoSend = defineModel<boolean>('autoSend')

const deviceStore = useSettingsAudioDevice()
const { enabled, selectedAudioInput } = storeToRefs(deviceStore)
const { listeningMode } = storeToRefs(useHearingStore())
const { audioInputs, permissionGranted, askPermission } = useAudioDevice()
const { volumeLevel } = useAudioAnalyzer()

// Auto-send only applies to continuous-listening (VAD) mode; hide the toggle in push-to-talk.
const pushToTalk = computed(() => listeningMode.value === 'ptt')

const ringEnabledClass = computed(() => enabled.value
  ? 'bg-primary-500/15 dark:bg-primary-600/20'
  : 'bg-neutral-300/20 dark:bg-neutral-700/20',
)

function toggleHearingEnabled() {
  if (enabled.value)
    return enabled.value = false
  if (selectedAudioInput.value !== '' && permissionGranted.value)
    return enabled.value = true
  if (!permissionGranted.value)
    return askPermission().then(() => { enabled.value = permissionGranted.value })
}
</script>

<template>
  <div class="space-y-2">
    <!-- Minimal mic control with animated rings -->
    <div class="flex flex-col items-center justify-center py-2">
      <div class="relative h-28 w-28 select-none">
        <!-- Rings (scale + opacity follow volume) -->
        <div
          class="absolute left-1/2 top-1/2 h-20 w-20 rounded-full transition-all duration-150 -translate-x-1/2 -translate-y-1/2"
          :style="{ transform: `translate(-50%, -50%) scale(${1 + (volumeLevel / 100) * 0.35})`, opacity: String(0.25 + (volumeLevel / 100) * 0.25) }"
          :class="ringEnabledClass"
        />
        <div
          class="absolute left-1/2 top-1/2 h-24 w-24 rounded-full transition-all duration-200 -translate-x-1/2 -translate-y-1/2"
          :style="{ transform: `translate(-50%, -50%) scale(${1.2 + (volumeLevel / 100) * 0.55})`, opacity: String(0.15 + (volumeLevel / 100) * 0.2) }"
          :class="enabled ? 'bg-primary-500/10 dark:bg-primary-600/15' : 'bg-neutral-300/10 dark:bg-neutral-700/10'"
        />
        <div
          class="absolute left-1/2 top-1/2 h-28 w-28 rounded-full transition-all duration-300 -translate-x-1/2 -translate-y-1/2"
          :style="{ transform: `translate(-50%, -50%) scale(${1.5 + (volumeLevel / 100) * 0.8})`, opacity: String(0.08 + (volumeLevel / 100) * 0.15) }"
          :class="enabled ? 'bg-primary-500/5 dark:bg-primary-600/10' : 'bg-neutral-300/5 dark:bg-neutral-700/5'"
        />

        <!-- Mic icon button -->
        <button
          class="absolute left-1/2 top-1/2 grid h-16 w-16 place-items-center rounded-full shadow-md outline-none transition-all duration-200 -translate-x-1/2 -translate-y-1/2"
          :class="[
            enabled ? 'bg-primary-500 text-white hover:bg-primary-600 active:scale-95' : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 active:scale-95 dark:bg-neutral-700 dark:text-neutral-200',
          ]"
          @click="toggleHearingEnabled"
        >
          <div :class="enabled ? 'i-ph:microphone' : 'i-ph:microphone-slash'" class="h-6 w-6" />
        </button>
      </div>

      <div class="mt-3 h-1" />

      <!-- Permission callout when needed (Electron contexts) -->
      <div v-if="!props.granted" class="mt-3 w-full">
        <Callout theme="orange" label="Microphone permission required">
          <div class="text-sm">
            The app doesn't have permission to access your microphone.
            Please grant microphone access in your system settings to enable audio input.
          </div>
        </Callout>
      </div>
    </div>

    <!-- Auto-send toggle (continuous-listening / VAD mode only; hidden in push-to-talk) -->
    <div v-if="props.showAutoSend && !pushToTalk" class="flex flex-wrap gap-2">
      <Button
        label="Auto send"
        :variant="autoSend ? 'primary' : 'secondary'"
        flex-1
        @click="autoSend = !autoSend"
      />
    </div>

    <!-- Always-visible device selector -->
    <div class="mt-3 w-full">
      <FieldCombobox
        v-model="selectedAudioInput"
        label="Input device"
        description="Select the microphone you want to use."
        :options="audioInputs.map(device => ({ label: device.label || 'Unknown Device', value: device.deviceId }))"
        placeholder="Select microphone"
        layout="vertical"
      />
    </div>
  </div>
</template>
