<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useVoiceControlsStore } from '../../../../stores/voice-controls'
import { useWakeWordDetectionStore } from '../../../../stores/wake-word-detection'

const { t } = useI18n()
const wakeWordDetection = useWakeWordDetectionStore()
const voiceControls = useVoiceControlsStore()

/**
 * Preparation of the wake word detector. The voice host owns the detector, so this reads the host snapshot, not the local store.
 * Without an active pronunciation, the hint tells the user that a character must set wake words first.
 */
const status = computed<{ tone: 'error' | 'ready' | 'hint', text: string }>(() => {
  if (wakeWordDetection.pronunciations.length === 0)
    return { tone: 'hint', text: t('settings.pages.modules.hearing.sections.section.input-mode.wake-word-status.no-words') }

  const host = voiceControls.snapshot.wakeWords
  const preparation = host?.preparation ?? 'unconfigured'
  if (preparation === 'error')
    return { tone: 'error', text: t('settings.pages.modules.hearing.sections.section.input-mode.wake-word-status.error', { error: host?.error ?? '' }) }
  return { tone: preparation === 'ready' ? 'ready' : 'hint', text: t(`settings.pages.modules.hearing.sections.section.input-mode.wake-word-status.${preparation}`) }
})
const toneClasses = {
  error: ['text-red-500 dark:text-red-400'],
  ready: ['text-emerald-600 dark:text-emerald-400'],
  hint: ['text-neutral-500 dark:text-neutral-400'],
} as const
const toneIcons = {
  error: 'i-solar:danger-circle-line-duotone',
  ready: 'i-solar:check-circle-line-duotone',
  hint: 'i-solar:info-circle-line-duotone',
} as const
</script>

<template>
  <div
    data-testid="hearing-wake-word-status"
    role="status"
    :data-tone="status.tone"
    :class="['flex items-center gap-1.5 text-sm', toneClasses[status.tone]]"
  >
    <div :class="[toneIcons[status.tone], 'shrink-0']" />
    {{ status.text }}
  </div>
</template>
