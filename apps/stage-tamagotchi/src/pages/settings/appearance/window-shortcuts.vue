<script setup lang="ts">
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useShortcutsStore } from '../../../stores/shortcuts'

const settings = useSettings()

const { t } = useI18n()
const { shortcuts } = storeToRefs(useShortcutsStore())

const usePageSpecificTransitionsSettingChanged = ref(false)

// avoid showing the animation component when the page specific transitions are enabled
watch(() => [settings.usePageSpecificTransitions, settings.disableTransitions], () => {
  usePageSpecificTransitionsSettingChanged.value = true
})

const recordingFor = ref<string | null>(null)
const recordingKeys = ref<{
  modifier: string[]
  key: string
}>({
  modifier: [],
  key: '',
})

// Add function to handle shortcut recording
function startRecording(shortcut: typeof shortcuts.value[0]) {
  recordingFor.value = shortcut.type
}

onMounted(() => {
  getCurrentWindow().setMinimizable(false) // to avoid the window from being minimized when the shortcut is being recorded
})

onUnmounted(() => {
  getCurrentWindow().setMinimizable(true)
})

// Handle key combinations
useEventListener('keydown', (e) => {
  if (!recordingFor.value)
    return
  if (!e.code.startsWith('Key')) // ignore non-key events
    return
  if (e.metaKey)
    recordingKeys.value.modifier.push('Meta')
  if (e.ctrlKey)
    recordingKeys.value.modifier.push('Control')
  if (e.altKey)
    recordingKeys.value.modifier.push('Alt')
  if (e.shiftKey)
    recordingKeys.value.modifier.push('Shift')

  if (recordingKeys.value.modifier.length === 0)
    return

  recordingKeys.value.key = e.code.slice(3)
  const shortcut = shortcuts.value.find(s => s.type === recordingFor.value)
  if (shortcut)
    shortcut.shortcut = `${recordingKeys.value.modifier.join('+')}+${recordingKeys.value.key}`
  recordingKeys.value = {
    modifier: [],
    key: '',
  }
  recordingFor.value = null
}, { passive: false })
// Add click outside handler to cancel recording
useEventListener('click', (e) => {
  if (recordingFor.value) {
    const target = e.target as HTMLElement
    if (!target.closest('.shortcut-item')) {
      recordingFor.value = null
      recordingKeys.value = {
        modifier: [],
        key: '',
      }
    }
  }
})

const pressKeysMessage = computed(() => {
  if (recordingKeys.value.modifier.length === 0)
    return t('tamagotchi.settings.pages.themes.window-shortcuts.press-keys')
  return `${t('tamagotchi.settings.pages.themes.window-shortcuts.press-keys')}: ${recordingKeys.value.modifier.join('+')}+${recordingKeys.value.key}`
})
function isConflict(shortcut: typeof shortcuts.value[0]) {
  return shortcuts.value.some(s => s.type !== shortcut.type && s.shortcut === shortcut.shortcut)
}
</script>

<template>
  <div pb-2>
    <div
      v-for="shortcut in shortcuts" :key="shortcut.type"
      v-motion
      mb-2
      class="w-full flex items-center justify-between rounded-lg px-4 py-3 text-sm outline-none transition-all duration-250 ease-in-out"
      bg="neutral-50 dark:neutral-800"
      hover="bg-neutral-200 dark:bg-neutral-700"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (3 * 10)"
      :delay="3 * 50"
      transition="all ease-in-out duration-250"
      cursor-pointer
      @click="startRecording(shortcut)"
    >
      <span text="xs">
        {{ t(shortcut.name) }}
      </span>
      <div
        class="shortcut-item flex items-center justify-end gap-x-2 px-2 py-0.5"
        :class="{ recording: recordingFor === shortcut.type }"
        text="xs"
      >
        <div v-if="recordingFor === shortcut.type" class="pointer-events-none animate-flash animate-count-infinite">
          {{ pressKeysMessage }}
        </div>
        <div v-else class="pointer-events-none">
          {{ shortcut.shortcut }}
        </div>
        <div v-if="isConflict(shortcut)" text="xs" i-solar:danger-square-bold w-4 />
      </div>
    </div>
  </div>

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[65dvh]" right--15 z--1
    :initial="{ scale: 0.9, opacity: 0, rotate: 30 }"
    :enter="{ scale: 1, opacity: 1, rotate: 0 }"
    :duration="250"
    flex items-center justify-center
  >
    <div text="60" i-solar:keyboard-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
