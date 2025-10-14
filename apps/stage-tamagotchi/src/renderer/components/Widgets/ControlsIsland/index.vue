<script setup lang="ts">
import { HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { defineInvoke } from '@unbird/eventa'
import { createContext } from '@unbird/eventa/adapters/electron/renderer'
import { useDark, useToggle } from '@vueuse/core'
import { storeToRefs } from 'pinia'

import ControlButton from './ControlButton.vue'

import { electronOpenSettings } from '../../../../shared/eventa'

const isDark = useDark({ disableTransition: false })
const toggleDark = useToggle(isDark)

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { enabled } = storeToRefs(settingsAudioDeviceStore)

const { context } = createContext(window.electron.ipcRenderer)
const openSettings = defineInvoke(context, electronOpenSettings)
</script>

<template>
  <div fixed bottom-2 right-2>
    <div flex flex-col gap-1>
      <ControlButton @click="() => openSettings()">
        <div i-solar:settings-minimalistic-outline size-5 text="neutral-800 dark:neutral-300" />
      </ControlButton>
      <HearingConfigDialog>
        <ControlButton>
          <Transition name="fade" mode="out-in">
            <div v-if="enabled" i-ph:microphone size-5 text="neutral-800 dark:neutral-300" />
            <div v-else i-ph:microphone-slash size-5 text="neutral-800 dark:neutral-300" />
          </Transition>
        </ControlButton>
      </HearingConfigDialog>
      <ControlButton :class="['cursor-move', 'drag-region']">
        <div i-ph:arrows-out-cardinal size-5 text="neutral-800 dark:neutral-300" />
      </ControlButton>
      <ControlButton @click="() => toggleDark()">
        <Transition name="fade" mode="out-in">
          <div v-if="isDark" i-solar:moon-outline size-5 text="neutral-800 dark:neutral-300" />
          <div v-else i-solar:sun-2-outline size-5 text="neutral-800 dark:neutral-300" />
        </Transition>
      </ControlButton>
    </div>
  </div>
</template>
