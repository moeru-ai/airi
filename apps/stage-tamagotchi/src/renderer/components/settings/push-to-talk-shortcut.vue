<script setup lang="ts">
import type { ShortcutAccelerator } from '@proj-airi/stage-shared/global-shortcut'

import { formatAccelerator } from '@proj-airi/stage-shared/global-shortcut'
import { Button } from '@proj-airi/ui'
import { isMacOS } from 'std-env'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  DEFAULT_PUSH_TO_TALK_SHORTCUT,
  useDesktopPushToTalkShortcut,
  useDesktopPushToTalkShortcutError,
} from '../../composables/use-desktop-push-to-talk'

const shortcut = useDesktopPushToTalkShortcut()
const registrationError = useDesktopPushToTalkShortcutError()
const recording = shallowRef(false)
const { t } = useI18n()
const tt = (name: string) => t(`settings.pages.modules.hearing.push-to-talk-shortcut.${name}`)
const label = computed(() => recording.value
  ? tt('placeholder')
  : formatAccelerator(shortcut.value).replaceAll('Key', '').replaceAll('Digit', '').replaceAll('+', ' + '))

function recordShortcut(event: KeyboardEvent) {
  if (!recording.value)
    return
  event.preventDefault()
  event.stopPropagation()
  if (event.code === 'Escape') {
    recording.value = false
    return
  }
  if (event.repeat || ['Alt', 'Control', 'Meta', 'Shift'].includes(event.key))
    return

  const modifiers: ShortcutAccelerator['modifiers'] = []
  if (event.metaKey)
    modifiers.push(isMacOS ? 'cmd' : 'super')
  if (event.ctrlKey)
    modifiers.push('ctrl')
  if (event.altKey)
    modifiers.push('alt')
  if (event.shiftKey)
    modifiers.push('shift')
  if (!modifiers.length)
    return

  shortcut.value = { modifiers, key: event.code }
  registrationError.value = null
  recording.value = false
}

function reset() {
  shortcut.value = { ...DEFAULT_PUSH_TO_TALK_SHORTCUT, modifiers: [...DEFAULT_PUSH_TO_TALK_SHORTCUT.modifiers] }
  registrationError.value = null
}
</script>

<template>
  <section
    :class="['flex flex-col gap-4 rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800']"
    @keydown.capture="recordShortcut"
  >
    <div>
      <h2 :class="['text-sm text-neutral-900 font-medium dark:text-neutral-50']">
        {{ tt('label') }}
      </h2>
      <p :class="['mt-1 text-xs text-neutral-500 leading-relaxed dark:text-neutral-400']">
        {{ tt('description') }}
      </p>
    </div>
    <div :class="['flex items-center gap-2']">
      <button
        type="button"
        :class="[
          'min-h-12 flex-1 rounded-lg border-2 border-solid px-3 py-2 text-left font-mono text-sm transition-colors',
          'border-neutral-100 bg-neutral-50 text-neutral-900 hover:bg-neutral-100 active:bg-neutral-200',
          'dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-900 dark:active:bg-neutral-800',
        ]"
        @click="recording = true"
      >
        <span :class="recording ? ['animate-pulse animate-duration-2s animate-count-infinite'] : []">
          {{ label }}
        </span>
      </button>
      <Button size="md" :label="tt('reset')" @click="reset" />
    </div>
    <p v-if="registrationError" :class="['text-xs text-red-600 dark:text-red-400']">
      {{ tt('registration-failed') }}
    </p>
  </section>
</template>
