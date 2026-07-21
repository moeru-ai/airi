<script setup lang="ts">
import type { ShortcutAccelerator, ShortcutFailureReason } from '@proj-airi/stage-shared/global-shortcut'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { formatAccelerator, ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { Button } from '@proj-airi/ui'
import { isMacOS } from 'std-env'
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import {
  electronSpotlightShortcutGet,
  electronSpotlightShortcutSet,
} from '../../../../shared/eventa'
import { isSafeSpotlightAccelerator } from '../../../../shared/spotlight-shortcut'

const getShortcut = useElectronEventaInvoke(electronSpotlightShortcutGet)
const setShortcut = useElectronEventaInvoke(electronSpotlightShortcutSet)
const { trackSettingsChanged } = useAnalytics()
const { t } = useI18n()
const tt = (key: string) => t(`tamagotchi.settings.pages.system.window-shortcuts.${key}`)

const accelerator = shallowRef<ShortcutAccelerator>()
const recording = shallowRef(false)

const shortcutLabel = computed(() => {
  if (recording.value)
    return tt('actions.recording')
  return accelerator.value
    ? formatAccelerator(accelerator.value).replaceAll('Key', '').replaceAll('Digit', '').replaceAll('+', ' + ')
    : tt('empty')
})

function errorKeyForReason(reason: ShortcutFailureReason) {
  if (reason === ShortcutFailureReasons.Conflict)
    return 'errors.conflict'
  if (reason === ShortcutFailureReasons.Invalid)
    return 'errors.requiresModifier'
  return 'errors.failed'
}

function acceleratorFromEvent(event: KeyboardEvent): ShortcutAccelerator | null {
  if (event.repeat || ['Alt', 'Control', 'Meta', 'Shift'].includes(event.key))
    return null

  const modifiers: ShortcutAccelerator['modifiers'] = []
  if (event.metaKey)
    modifiers.push(isMacOS ? 'cmd' : 'super')
  if (event.ctrlKey)
    modifiers.push('ctrl')
  if (event.altKey)
    modifiers.push('alt')
  if (event.shiftKey)
    modifiers.push('shift')

  return { modifiers, key: event.code }
}

async function saveShortcut(next: ShortcutAccelerator | null) {
  try {
    const result = await setShortcut({ accelerator: next })
    if (!result.ok) {
      toast.error(tt(errorKeyForReason(result.reason)))
      return
    }
    accelerator.value = result.actualAccelerator ?? next ?? accelerator.value
    // Value is intentionally coarse (customized / reset) — the exact key
    // combo is a fingerprinting-adjacent detail no dashboard needs.
    trackSettingsChanged({
      setting_name: 'spotlight_shortcut',
      new_value: next ? 'customized' : 'reset_to_default',
      source: 'settings',
    })
  }
  catch {
    toast.error(tt('errors.failed'))
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

  const next = acceleratorFromEvent(event)
  if (!next)
    return
  recording.value = false
  if (!isSafeSpotlightAccelerator(next)) {
    toast.error(tt('errors.requiresModifier'))
    return
  }
  void saveShortcut(next)
}

onMounted(async () => {
  try {
    accelerator.value = await getShortcut()
  }
  catch {
    toast.error(tt('errors.load'))
  }
})
</script>

<template>
  <section
    :class="['flex flex-col gap-4 rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800']"
    @keydown.capture="recordShortcut"
  >
    <div :class="['flex items-start gap-3']">
      <div :class="['min-w-0 flex-1']">
        <h2 :class="['text-sm text-neutral-900 font-medium dark:text-neutral-50']">
          {{ tt('spotlight.title') }}
        </h2>
        <p :class="['mt-1 text-xs text-neutral-500 leading-relaxed dark:text-neutral-400']">
          {{ tt('spotlight.description') }}
        </p>
      </div>
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
        @click="saveShortcut(null)"
      />
    </div>
  </section>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.system.window-shortcuts.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
