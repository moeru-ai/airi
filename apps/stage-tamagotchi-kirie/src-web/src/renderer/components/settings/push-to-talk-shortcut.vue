<script setup lang="ts">
import type { ShortcutAccelerator, ShortcutFailureReason } from '@proj-airi/stage-shared/global-shortcut'

import { errorMessageFrom } from '@moeru/std'
import { useHostGlobalShortcuts, useHostSpotlightShortcut } from '@proj-airi/stage-host-context'
import { formatAccelerator, isSameKeyCombination, ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { Button } from '@proj-airi/ui'
import { isMacOS } from 'std-env'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { defaultPushToTalkAccelerator, isHoldableAccelerator, PUSH_TO_TALK_SHORTCUT_ID, usePushToTalkShortcutSettings } from '../../composables/use-push-to-talk-shortcut'
import { acceleratorFromKeyboardEvent } from '../../utils/shortcut-recording'

const { t } = useI18n()
const tt = (key: string) => t(`tamagotchi.settings.pages.system.window-shortcuts.${key}`)
const hearing = useHearingStore()
const devices = useSettingsAudioDevice()
// The stage window applies these settings. This page only edits them and shows its latest registration result.
const { accelerator, registrationError } = usePushToTalkShortcutSettings()
const { list: listShortcuts } = useHostGlobalShortcuts()
const { get: getSpotlightShortcut } = useHostSpotlightShortcut()
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

/**
 * Tells if another app shortcut, such as Spotlight, already uses the key combination.
 * The host rejects such a registration too. This check shows the reason before the stage window tries.
 * The list contains only the shortcuts that are registered now. A disabled Push to Talk shortcut is not in it.
 */
async function usedByAnotherShortcut(next: ShortcutAccelerator) {
  try {
    const [bindings, spotlightAccelerator] = await Promise.all([
      listShortcuts(),
      getSpotlightShortcut().catch(() => undefined),
    ])
    if (spotlightAccelerator && isSameKeyCombination(spotlightAccelerator, next, { isMacOS }))
      return true
    return bindings.some(binding => binding.id !== PUSH_TO_TALK_SHORTCUT_ID && isSameKeyCombination(binding.accelerator, next, { isMacOS }))
  }
  catch (error) {
    // The registration in the stage window checks again and reports a conflict, so the recorder can accept the value.
    console.warn('[push-to-talk] Cannot list shortcuts:', errorMessageFrom(error))
    return false
  }
}

async function applyShortcut(next: ShortcutAccelerator) {
  if (!isHoldableAccelerator(next)) {
    toast.error(tt('errors.requiresHoldModifier'))
    return
  }
  if (await usedByAnotherShortcut(next)) {
    toast.error(tt('errors.conflict'))
    return
  }
  accelerator.value = next
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
  void applyShortcut(next)
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
