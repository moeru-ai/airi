<script setup lang="ts">
import { useToggle } from '@vueuse/core'
import { storeToRefs } from 'pinia'

import Button from '../../../misc/Button.vue'

import { useSettingsAudioDevice } from '../../../../stores/settings'

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { enabled } = storeToRefs(settingsAudioDeviceStore)
const toggleAudioDevice = useToggle(enabled)
</script>

<template>
  <div>
    <div>
      <Button @click="() => toggleAudioDevice()">
        <span>{{ enabled ? 'Disable Microphone' : 'Enable Microphone' }}</span>
      </Button>
    </div>
  </div>
</template>
