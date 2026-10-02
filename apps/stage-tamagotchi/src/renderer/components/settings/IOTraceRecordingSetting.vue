<script setup lang="ts">
import { CheckBar } from '@proj-airi/stage-ui/components'
import { getIOTraceRecordingState, setIOTraceRecordingEnabled } from '@proj-airi/stage-ui/composables/io-trace-recording'
import { computed, ref } from 'vue'

const state = getIOTraceRecordingState()
const busy = ref(false)
const enabled = computed({
  get: () => state.value.enabled,
  set: (next: boolean) => {
    busy.value = true
    void setIOTraceRecordingEnabled(next)
      .catch(error => console.error('Failed to update IO trace recording:', error))
      .finally(() => {
        busy.value = false
      })
  },
})
</script>

<template>
  <CheckBar
    v-model="enabled"
    :disabled="busy || !state.managed"
    mb-2
    icon-on="i-solar:record-circle-bold-duotone"
    icon-off="i-solar:record-circle-line-duotone"
    text="tamagotchi.settings.devtools.pages.io-tracer.recording.title"
    description="tamagotchi.settings.devtools.pages.io-tracer.recording.description"
    transition="all ease-in-out duration-250"
  />
</template>
