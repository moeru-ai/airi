<script setup lang="ts">
import { FieldSelect } from '@proj-airi/ui'
import { useToggle } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import Button from '../../../misc/Button.vue'

import { useSettingsAudioDevice } from '../../../../stores/settings'

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { enabled, audioInputs, selectedAudioInput } = storeToRefs(settingsAudioDeviceStore)
const toggleAudioDevice = useToggle(enabled)

function requestPermission() {
  // Generic permission request via mediaDevices; in Electron, renderer wrappers may also call OS APIs.
  settingsAudioDeviceStore.askPermission()
}

const audioInputOptions = computed(() => audioInputs.value.map(input => ({
  label: input.label || input.deviceId,
  value: input.deviceId,
})))
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <Button @click="() => toggleAudioDevice()">
        <span>{{ enabled ? 'Disable Microphone' : 'Enable Microphone' }}</span>
      </Button>
      <Button variant="secondary" @click="requestPermission">
        Request Microphone Access
      </Button>
    </div>

    <FieldSelect
      v-model="selectedAudioInput"
      label="Audio Input Device"
      description="Select the audio input device"
      :options="audioInputOptions"
      placeholder="Select an audio input device"
      layout="vertical"
    />
  </div>
</template>
