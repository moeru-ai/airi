<script setup lang="ts">
import { Collapsable } from '@proj-airi/stage-ui/components'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useShortcutsStore } from '../../../stores/shortcuts'

const { t } = useI18n()
const router = useRouter()
const shortcutsStore = useShortcutsStore()
const { shortcuts } = storeToRefs(shortcutsStore)

const recordingFor = ref<string | null>(null)
const recordingKeys = ref<{
  modifier: string[]
  key: string
}>({
  modifier: [],
  key: '',
})

function startRecording(shortcutType: string) {
  recordingFor.value = shortcutType
}

function isModifierKey(key: string) {
  return ['Shift', 'Control', 'Alt', 'Meta'].includes(key)
}

// Handle key combinations
useEventListener('keydown', (e) => {
  if (!recordingFor.value)
    return

  e.preventDefault()

  if (e.key === 'Escape') {
    recordingFor.value = null
    return
  }

  if (isModifierKey(e.key)) {
    if (recordingKeys.value.modifier.includes(e.key))
      return

    recordingKeys.value.modifier.push(e.key)

    return
  }

  if (recordingKeys.value.modifier.length === 0)
    return

  recordingKeys.value.key = e.key.toUpperCase()

  const shortcut = shortcuts.value.find(s => s.type === recordingFor.value)
  if (shortcut)
    shortcut.shortcut = `${recordingKeys.value.modifier.join('+')}+${recordingKeys.value.key}`

  recordingKeys.value = {
    modifier: [],
    key: '',
  }
  recordingFor.value = null
}, { passive: false })

const pressKeysMessage = computed(() => {
  const i18nMessage = t('settings.pages.shortcuts.sections.section.window-controls.press-keys-hint.label')

  if (recordingKeys.value.modifier.length === 0)
    return i18nMessage

  return `${i18nMessage}: ${recordingKeys.value.modifier.join(' + ')} + ${recordingKeys.value.key}`
})

function isConflict(shortcut: typeof shortcuts.value[0]) {
  return shortcuts.value.some(s => s.type !== shortcut.type && s.shortcut === shortcut.shortcut)
}

function toReadable(shortcut: string) {
  return shortcut.replaceAll('Meta', '⌘').replaceAll('Control', 'Ctrl').replaceAll('Alt', '⌥').replaceAll('Shift', '⇧').replaceAll('+', ' + ')
}
</script>

<template>
  <div
    v-motion
    flex="~ row" items-center gap-2
    :initial="{ opacity: 0, x: 10 }"
    :enter="{ opacity: 1, x: 0 }"
    :leave="{ opacity: 0, x: -10 }"
    :duration="250"
  >
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500" text-nowrap>{{ t('settings.title') }}</span>
      </div>
      <div text-nowrap text-3xl font-semibold>
        {{ t('settings.pages.shortcuts.title') }}
      </div>
    </h1>
  </div>

  <div flex-col>
    <Collapsable mt-4 w-full :default="true">
      <template #trigger="slotProps">
        <button
          bg="zinc-100 dark:zinc-800"
          hover="bg-zinc-200 dark:bg-zinc-700"
          transition="all ease-in-out duration-250"
          w-full flex items-center gap-1.5 rounded-lg px-4 py-3 outline-none
          class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
          @click="slotProps.setVisible(!slotProps.visible)"
        >
          <div flex="~ row 1" items-center gap-1.5>
            <div
              i-solar:window-frame-bold-duotone class="provider-icon size-6"
              transition="filter duration-250 ease-in-out"
            />
            <div>
              {{ t('settings.pages.shortcuts.sections.section.window-controls.title') }}
            </div>
          </div>
          <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
            <div i-solar:alt-arrow-down-bold-duotone />
          </div>
        </button>
      </template>
      <div p-4 flex="~ col gap-4">
        <div
          v-for="shortcut in shortcuts"
          :key="shortcut.name"
          flex="~ row"
          bg="neutral-100 dark:neutral-800"
          hover="bg-neutral-200 dark:bg-neutral-700"
          transition="all ease-in-out duration-250" cursor-pointer
          items-center justify-between gap-4 rounded-lg px-4 py-3
        >
          <div text-base font-medium>
            {{ t(shortcut.name) }}
          </div>
          <div class="shortcut-item" flex="~ row" gap-2 text-sm text="neutral-500 dark:neutral-400">
            <div v-if="recordingFor === shortcut.type" class="animate-flash animate-duration-2s animate-count-infinite">
              {{ toReadable(pressKeysMessage) }}
            </div>
            <div v-else flex items-center gap-2 @click="startRecording(shortcut.type)">
              <div>{{ toReadable(shortcut.shortcut) }}</div>
              <div v-if="isConflict(shortcut)" i-solar:danger-circle-bold-duotone text-red-500 />
            </div>
          </div>
        </div>
      </div>
    </Collapsable>
  </div>

  <div text="neutral-200/50 dark:neutral-500/20" pointer-events-none fixed bottom-0 right-0 z--1 translate-x-10 translate-y-10>
    <div text="40" i-lucide:keyboard />
  </div>
</template>
