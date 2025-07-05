<script lang="ts" setup>
import { Button } from '@proj-airi/stage-ui/components'
import { Option, Select } from '@proj-airi/ui'
import { onMounted, onUnmounted } from 'vue'

import { useAudioInput } from '../../composables/audio-input'
import { useAudioRecord } from '../../composables/audio-record'

const { audioInputs, selectedAudioInputId, start, stop, media, request } = useAudioInput()
const { startRecord, stopRecord } = useAudioRecord(media.stream, start)

onMounted(() => request())
onUnmounted(() => stop())
</script>

<template>
  <div>
    <Select v-model="selectedAudioInputId" @change="() => start()">
      <template #default="{ value }">
        <div>
          {{ value ? audioInputs.find(device => device.deviceId === value)?.label : 'Select Audio Input' }}
        </div>
      </template>
      <template #options="{ hide }">
        <Option
          v-for="device in audioInputs"
          :key="device.deviceId"
          :value="device.deviceId"
          :active="device.deviceId === selectedAudioInputId"
          @click="hide()"
        >
          {{ device.label }}
        </Option>
      </template>
    </Select>
    <div class="mt-4 w-full flex justify-center gap-2">
      <Button @click="startRecord">
        Start Recording
      </Button>
      <Button @click="stopRecord">
        Stop Recording
      </Button>
    </div>
  </div>
</template>
