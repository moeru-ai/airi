<script setup lang="ts">
import { Section } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
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
function isModifierKey(key: string) {
  return ['Shift', 'Control', 'Alt', 'Meta'].includes(key)
}
// Handle key combinations
useEventListener('keydown', (e) => {
  if (!recordingFor.value)
    return
  e.preventDefault()
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
// Add click outside handler to cancel recording
useEventListener('click', (e) => {
  if (recordingFor.value) {
    const target = e.target as HTMLElement
    if (!target.closest('.shortcut-item')) {
      recordingFor.value = null
    }
  }
})

const pressKeysMessage = computed(() => {
  if (recordingKeys.value.modifier.length === 0)
    return t('settings.press_keys')
  return `${t('settings.press_keys')}: ${recordingKeys.value.modifier.join('+')}+${recordingKeys.value.key}`
})
function isConflict(shortcut: typeof shortcuts.value[0]) {
  return shortcuts.value.some(s => s.type !== shortcut.type && s.shortcut === shortcut.shortcut)
}
</script>

<template>
  <Section
    v-motion
    mb-2 :title="t('settings.pages.themes.sections.section.window-shortcuts.title')"
    icon="i-solar:keyboard-bold-duotone"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (10 * 10)"
    :delay="10 * 50"
    transition="all ease-in-out duration-250"
  >
    <div pb-2>
      <div
        grid="~ cols-[140px_1fr]" my-2 items-center gap-1.5 rounded-lg
        bg="[#fff6fc]" p-2 text="pink-400"
      >
        <template v-for="shortcut in shortcuts" :key="shortcut.type">
          <span text="xs pink-500">
            {{ t(shortcut.name) }}
          </span>
          <div
            class="shortcut-item flex items-center justify-end gap-x-2 px-2 py-0.5"
            :class="{ recording: recordingFor === shortcut.type }"
            text="xs pink-500"
            cursor-pointer
            @click="startRecording(shortcut)"
          >
            <div v-if="recordingFor === shortcut.type" class="pointer-events-none animate-flash animate-count-infinite">
              {{ pressKeysMessage }}
            </div>
            <div v-else class="pointer-events-none">
              {{ shortcut.shortcut }}
            </div>
            <div v-if="isConflict(shortcut)" text="xs pink-500" i-solar:danger-square-bold w-4 />
          </div>
        </template>
      </div>
    </div>
  </Section>

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[65dvh]" right--15 z--1
    :initial="{ scale: 0.9, opacity: 0, rotate: 30 }"
    :enter="{ scale: 1, opacity: 1, rotate: 0 }"
    :duration="250"
    flex items-center justify-center
  >
    <div text="60" i-solar:filters-bold-duotone />
  </div>
</template>

<style scoped>
.theme-hue-slider {
  --at-apply: appearance-none h-10 rounded-lg;
  background: linear-gradient(
    to right,
    oklch(85% 0.2 0),
    oklch(85% 0.2 60),
    oklch(85% 0.2 120),
    oklch(85% 0.2 180),
    oklch(85% 0.2 240),
    oklch(85% 0.2 300),
    oklch(85% 0.2 360)
  );

  &::-webkit-slider-thumb {
    --at-apply: w-1 h-12 appearance-none rounded-md bg-neutral-600 cursor-pointer shadow-lg border-2 border-neutral-500
      hover: bg-neutral-800 transition-colors duration-200;
  }

  .dark &::-webkit-slider-thumb {
    --at-apply: w-1 h-12 appearance-none rounded-md bg-neutral-100 cursor-pointer shadow-md border-2 border-white
      hover: bg-neutral-300 transition-colors duration-200;
  }

  &::-moz-range-thumb {
    --at-apply: w-1 h-12 appearance-none rounded-md bg-neutral-600 cursor-pointer shadow-lg border-2 border-neutral-500
      hover: bg-neutral-800 transition-colors duration-200;
  }

  .dark &::-moz-range-thumb {
    --at-apply: w-1 h-12 appearance-none rounded-md bg-neutral-100 cursor-pointer shadow-md border-2 border-white
      hover: bg-neutral-300 transition-colors duration-200;
  }
}

.color-bar {
  --at-apply: flex of-hidden rounded-lg lh-10 text-center text-black;

  * {
    flex: 1;
  }

  div {
    display: contents;
  }
}

.transparency-grid {
  background-image: linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 20px 20px;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0px;
  background-color: #fff;
}
</style>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
