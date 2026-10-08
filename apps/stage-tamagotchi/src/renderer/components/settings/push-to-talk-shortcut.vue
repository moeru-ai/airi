<script setup lang="ts">
import type { ShortcutFailureReason } from '@proj-airi/stage-shared/global-shortcut'

import { formatAccelerator, ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { Button } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { defaultPushToTalkAccelerator, isHoldableAccelerator, usePushToTalkShortcutSettings } from '../../composables/use-push-to-talk-shortcut'
import { acceleratorFromKeyboardEvent } from '../../utils/shortcut-recording'

const { t } = useI18n()
const tt = (key: string) => t(`tamagotchi.settings.pages.system.window-shortcuts.${key}`)
const hearing = useHearingStore()
const devices = useSettingsAudioDevice()
// The stage window applies these settings. This page only edits them and shows its latest registration result.
const { accelerator, registrationError } = usePushToTalkShortcutSettings()
const recording = shallowRef(false)
const active = computed(() => devices.enabled && hearing.inputMode === 'push-to-talk')

const shortcutLabel = computed(() => recording.value
  ? tt('actions.recording')
  : formatAccelerator(accelerator.value).replaceAll('Key', '').replaceAll('Digit', '').replaceAll('+', ' + '))

function errorKeyForReason(reason: ShortcutFailureReason) {
  switch (reason) {
    case ShortcutFailureReasons.Conflict:
    case ShortcutFailureReasons.DuplicateId:
      return 'errors.conflict'
    case ShortcutFailureReasons.Denied:
      return 'errors.denied'
    case ShortcutFailureReasons.Unsupported:
      return 'errors.unsupported'
    default:
      return 'errors.failed'
  }
}

function recordShortcut(event: KeyboardEvent) {
  if (!recording.value)
    return

  event.preventDefault()
  event.stopPropagation()
  if (event.code === 'Escape') {
    recording.value = false
    return
  }

  const next = acceleratorFromKeyboardEvent(event)
  if (!next)
    return
  recording.value = false
  if (!isHoldableAccelerator(next)) {
    toast.error(tt('errors.requiresHoldModifier'))
    return
  }
  accelerator.value = next
}
</script>

<template>
  <section
    data-testid="push-to-talk-shortcut"
    :class="['flex flex-col gap-4 rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800']"
    @keydown.capture="recordShortcut"
  >
    <div>
      <h2 :class="['text-sm text-neutral-900 font-medium dark:text-neutral-50']">
        {{ tt('push-to-talk.title') }}
      </h2>
      <p :class="['mt-1 text-xs text-neutral-500 leading-relaxed dark:text-neutral-400']">
        {{ tt('push-to-talk.description') }}
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
          {{ shortcutLabel }}
        </span>
      </button>
      <Button
        size="md"
        :label="tt('actions.reset')"
        @click="accelerator = defaultPushToTalkAccelerator()"
      />
    </div>

    <p v-if="!active" :class="['text-xs text-neutral-500 leading-relaxed dark:text-neutral-400']">
      {{ tt('push-to-talk.inactive') }}
    </p>
    <p v-else-if="registrationError" role="alert" :class="['text-xs text-red-600 leading-relaxed dark:text-red-400']">
      {{ tt(errorKeyForReason(registrationError)) }}
    </p>
  </section>
</template>
