<script setup lang="ts">
import { electron } from '@proj-airi/electron-eventa'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { useAsyncState } from '@vueuse/core'
import { onMounted } from 'vue'

const show = defineModel('show', { type: Boolean, default: false })
const getMediaAccessStatus = useElectronEventaInvoke(electron.systemPreferences.getMediaAccessStatus)
const { state: mediaAccessStatus, execute: refreshMediaAccessStatus } = useAsyncState(() => getMediaAccessStatus(['microphone']), 'not-determined')

onMounted(() => {
  void refreshMediaAccessStatus()
})
</script>

<template>
  <HearingConfigDialog
    v-model:show="show"
    :granted="mediaAccessStatus !== 'denied' && mediaAccessStatus !== 'restricted'"
  >
    <slot />
  </HearingConfigDialog>
</template>
