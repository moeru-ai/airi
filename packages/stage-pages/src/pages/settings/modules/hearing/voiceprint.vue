<script setup lang="ts">
import type { VoiceEnrollmentCommand } from '@proj-airi/stage-ui/services/speech/bus'

import { errorMessageFrom } from '@moeru/std'
import { MIN_ENROLLMENT_SPEECH_SECONDS } from '@proj-airi/stage-ui/libs/voice/voice-enrollment'
import { useVoiceControlsStore } from '@proj-airi/stage-ui/stores/voice-controls'
import { useVoiceprintStore } from '@proj-airi/stage-ui/stores/voiceprint'
import { Button, Callout, DoubleCheckButton, Progress, SettingsCard } from '@proj-airi/ui'
import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const controls = useVoiceControlsStore()
const voiceprints = useVoiceprintStore()

const sentences = computed(() => [1, 2, 3].map(index => t(`settings.pages.modules.hearing.voiceprint.sentence-${index}`)))
const enrollment = computed(() => controls.enrollment)
const busy = computed(() => enrollment.value.phase === 'recording' || enrollment.value.phase === 'enrolling')
const speechSeconds = computed(() => enrollment.value.phase === 'idle' ? 0 : enrollment.value.speechSeconds)
/** A command that the host rejected or could not receive. The enrollment state cannot show it. */
const commandError = shallowRef<string>()

/** `none`: nothing saved. `enrolled`: a usable voiceprint. `outdated`: another model revision computed it. */
const status = computed(() => {
  const record = voiceprints.record
  if (!record)
    return { state: 'none', text: t('settings.pages.modules.hearing.voiceprint.status.none') }
  if (voiceprints.outdated)
    return { state: 'outdated', text: t('settings.pages.modules.hearing.voiceprint.status.outdated') }
  return {
    state: 'enrolled',
    text: t('settings.pages.modules.hearing.voiceprint.status.enrolled', {
      date: new Date(record.createdAt).toLocaleDateString(locale.value),
      seconds: Math.round(record.seconds),
    }),
  }
})

/** The outcome of the last enrollment. An earlier enrollment in another window can also show here. */
const result = computed(() => {
  const value = enrollment.value
  switch (value.phase) {
    case 'enrolled':
      return { tone: 'green', text: t('settings.pages.modules.hearing.voiceprint.result.enrolled') } as const
    case 'cancelled':
      return { tone: 'neutral', text: t('settings.pages.modules.hearing.voiceprint.result.cancelled') } as const
    case 'failed':
      return value.failure === 'too-short'
        ? { tone: 'orange', text: t('settings.pages.modules.hearing.voiceprint.result.too-short', { seconds: value.speechSeconds.toFixed(1), min: MIN_ENROLLMENT_SPEECH_SECONDS }) } as const
        : { tone: 'orange', text: t('settings.pages.modules.hearing.voiceprint.result.error', { error: value.error ?? '' }) } as const
    default:
      return undefined
  }
})

/** Returns true when the host or this window accepted the command. */
async function send(type: VoiceEnrollmentCommand['type']): Promise<boolean> {
  commandError.value = undefined
  try {
    return (await controls.enrollmentCommand({ type })).status === 'accepted'
  }
  catch (error) {
    commandError.value = errorMessageFrom(error) ?? 'Voice enrollment command failed'
    return false
  }
}

/**
 * True from a Start click on this page until that enrollment ends. The stores outlive this page, so an
 * enrollment continues after the user leaves. Without controls, it can record for 30 s and save a voiceprint.
 */
let ownsEnrollment = false
watch(busy, (value) => {
  if (!value)
    ownsEnrollment = false
})

async function start() {
  // Set before the command, so a page that closes while the host has not answered still cancels.
  ownsEnrollment = true
  ownsEnrollment = await send('begin')
}

/** Cancels the enrollment that this page started. A host that records nothing answers `closed`. */
function cancelOwnEnrollment() {
  if (!ownsEnrollment)
    return
  ownsEnrollment = false
  controls.enrollmentCommand({ type: 'cancel' }).catch(() => {})
}

// A route change unmounts the page. A closed window does not, so `pagehide` covers that case.
onBeforeUnmount(cancelOwnEnrollment)
useEventListener('pagehide', cancelOwnEnrollment)

const resultClasses = {
  green: ['text-emerald-600 dark:text-emerald-400'],
  orange: ['text-amber-600 dark:text-amber-400'],
  neutral: ['text-neutral-500 dark:text-neutral-400'],
} as const
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <SettingsCard>
      <div :class="['flex flex-col gap-2 text-sm', 'text-neutral-500 dark:text-neutral-400']">
        <p>{{ t('settings.pages.modules.hearing.voiceprint.intro') }}</p>
        <p>{{ t('settings.pages.modules.hearing.voiceprint.privacy') }}</p>
        <p>{{ t('settings.pages.modules.hearing.voiceprint.unused') }}</p>
      </div>
    </SettingsCard>

    <SettingsCard>
      <p
        data-testid="voiceprint-status"
        :data-state="status.state"
        :class="['font-medium', 'text-neutral-700 dark:text-neutral-200']"
      >
        {{ status.text }}
      </p>

      <div :class="['flex flex-col gap-2']">
        <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.modules.hearing.voiceprint.instructions') }}
        </p>
        <ol :class="['flex flex-col gap-2 pl-5 list-decimal', 'text-neutral-800 dark:text-neutral-100']">
          <li v-for="sentence in sentences" :key="sentence">
            {{ sentence }}
          </li>
        </ol>
      </div>

      <div v-if="busy" data-testid="voiceprint-progress" :class="['flex flex-col gap-2']">
        <Progress :progress="Math.min(100, speechSeconds / MIN_ENROLLMENT_SPEECH_SECONDS * 100)" />
        <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ enrollment.phase === 'enrolling'
            ? t('settings.pages.modules.hearing.voiceprint.enrolling')
            : t('settings.pages.modules.hearing.voiceprint.progress', { seconds: speechSeconds.toFixed(1), min: MIN_ENROLLMENT_SPEECH_SECONDS }) }}
        </p>
      </div>

      <p
        v-else-if="result"
        data-testid="voiceprint-result"
        :data-phase="enrollment.phase"
        :class="['text-sm', resultClasses[result.tone]]"
      >
        {{ result.text }}
      </p>

      <Callout v-if="commandError" theme="orange">
        {{ commandError }}
      </Callout>

      <div :class="['flex flex-wrap items-center gap-2']">
        <template v-if="busy">
          <Button
            data-testid="voiceprint-finish"
            variant="primary"
            :label="t('settings.pages.modules.hearing.voiceprint.finish')"
            :disabled="enrollment.phase !== 'recording' || speechSeconds < MIN_ENROLLMENT_SPEECH_SECONDS"
            @click="send('finish')"
          />
          <Button
            data-testid="voiceprint-cancel"
            :label="t('settings.pages.modules.hearing.voiceprint.cancel')"
            @click="send('cancel')"
          />
        </template>
        <template v-else>
          <Button
            data-testid="voiceprint-start"
            variant="primary"
            icon="i-solar:microphone-3-bold-duotone"
            :label="voiceprints.record ? t('settings.pages.modules.hearing.voiceprint.again') : t('settings.pages.modules.hearing.voiceprint.start')"
            @click="start"
          />
          <DoubleCheckButton v-if="voiceprints.record" data-testid="voiceprint-delete" @confirm="voiceprints.remove()">
            {{ t('settings.pages.modules.hearing.voiceprint.delete') }}
            <template #confirm>
              {{ t('settings.pages.data.confirmations.yes') }}
            </template>
            <template #cancel>
              {{ t('settings.pages.card.cancel') }}
            </template>
          </DoubleCheckButton>
        </template>
      </div>

      <p v-if="!voiceprints.record" :class="['text-xs', 'text-neutral-400 dark:text-neutral-500']">
        {{ t('settings.pages.modules.hearing.voiceprint.download') }}
      </p>
    </SettingsCard>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.hearing.voiceprint.title
  subtitleKey: settings.pages.modules.hearing.title
  icon: i-solar:user-speak-rounded-bold-duotone
  stageTransition:
    name: slide
</route>
