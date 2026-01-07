<script setup lang="ts">
import { Callout, FieldSelect } from '@proj-airi/ui'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  enabled?: boolean
  granted?: boolean
  audioInputs?: MediaDeviceInfo[]
  volumeLevel?: number
}>(), {
  enabled: false,
  granted: false,
  audioInputs: () => [],
  volumeLevel: 0,
})

const enabled = defineModel<boolean>('enabled')
const selectedAudioInput = defineModel<string>('selectedAudioInput')

const ringEnabledClass = computed(() => enabled.value
  ? 'bg-primary-500/15 dark:bg-primary-600/20'
  : 'bg-neutral-300/20 dark:bg-neutral-700/20',
)
</script>

<template>
  <div class="space-y-2">
    <!-- Minimal mic control with animated rings -->
    <div class="flex flex-col items-center justify-center py-2">
      <div class="relative h-28 w-28 select-none">
        <!-- Rings (scale + opacity follow volume) -->
        <div
          class="absolute left-1/2 top-1/2 h-20 w-20 rounded-full transition-all duration-150 -translate-x-1/2 -translate-y-1/2"
          :style="{ transform: `translate(-50%, -50%) scale(${1 + (props.volumeLevel / 100) * 0.35})`, opacity: String(0.25 + (props.volumeLevel / 100) * 0.25) }"
          :class="ringEnabledClass"
        />
        <div
          class="absolute left-1/2 top-1/2 h-24 w-24 rounded-full transition-all duration-200 -translate-x-1/2 -translate-y-1/2"
          :style="{ transform: `translate(-50%, -50%) scale(${1.2 + (props.volumeLevel / 100) * 0.55})`, opacity: String(0.15 + (props.volumeLevel / 100) * 0.2) }"
          :class="props.enabled ? 'bg-primary-500/10 dark:bg-primary-600/15' : 'bg-neutral-300/10 dark:bg-neutral-700/10'"
        />
        <div
          class="absolute left-1/2 top-1/2 h-28 w-28 rounded-full transition-all duration-300 -translate-x-1/2 -translate-y-1/2"
          :style="{ transform: `translate(-50%, -50%) scale(${1.5 + (props.volumeLevel / 100) * 0.8})`, opacity: String(0.08 + (props.volumeLevel / 100) * 0.15) }"
          :class="props.enabled ? 'bg-primary-500/5 dark:bg-primary-600/10' : 'bg-neutral-300/5 dark:bg-neutral-700/5'"
        />

        <!-- Mic icon button -->
        <button
          class="absolute left-1/2 top-1/2 grid h-16 w-16 place-items-center rounded-full shadow-md outline-none transition-all duration-200 -translate-x-1/2 -translate-y-1/2"
          :class="[
            props.enabled ? 'bg-primary-500 text-white hover:bg-primary-600 active:scale-95' : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 active:scale-95 dark:bg-neutral-700 dark:text-neutral-200',
          ]"
          @click="() => enabled = !enabled"
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

    <!-- Always-visible device selector -->
    <div class="mt-3 w-full">
      <FieldSelect
        v-model="selectedAudioInput"
        label="Input device"
        description="Select the microphone you want to use."
        :options="props.audioInputs.map(device => ({ label: device.label || 'Unknown Device', value: device.deviceId }))"
        placeholder="Select microphone"
        layout="vertical"
      />
    </div>
  </div>
</template>
