<script setup lang="ts">
import type { VoiceprintCirclesStage } from './voiceprint-circles-visual.vue'

import { Alert, Button, FieldCheckbox, IconButton, Input } from '@proj-airi/ui'
import { refAutoReset } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import PermissionPageLayout from './permission-page-layout.vue'
import PermissionStatusLine from './permission-status-line.vue'
import VoiceprintCirclesVisual from './voiceprint-circles-visual.vue'

import { useMicrophoneSpectrum } from '../../../composables/permissions/use-microphone-spectrum'
import { useVoiceEnrollment } from '../../../composables/use-voice-enrollment'
import { MIN_ENROLLMENT_SPEECH_SECONDS, TARGET_ENROLLMENT_SPEECH_SECONDS } from '../../../libs/voice/voice-enrollment'
import { useHearingStore } from '../../../stores/modules/hearing'
import { useVoiceprintStore } from '../../../stores/voiceprint'
import { VoiceprintSample } from '../voiceprint'

/** The flow enrolls at most this many voiceprints. The settings page enrolls more. */
const ONBOARDING_VOICEPRINT_LIMIT = 2
/** From this part of the target speech, the status under the circles tells the user that the recording ends soon. */
const ALMOST_THERE_PROGRESS = 0.75
/** The user counts as speaking until this long after the counted speech last grew. Short pauses between words stay speech. */
const SPEAKING_HOLD_MS = 1500

const { t } = useI18n()

const voiceprints = useVoiceprintStore()
const { speakerRecognitionEnabled } = storeToRefs(useHearingStore())
// The enrollment belongs to this page. Leaving the page cancels a recording, and nothing is saved then.
const { state: enrollment, busy, begin, finish, cancel, keep, discard } = useVoiceEnrollment()
const recording = computed(() => enrollment.value.phase === 'recording')
/** The circles follow the voice only while the enrollment records. */
const spectrum = useMicrophoneSpectrum(recording)
const speechSeconds = computed(() => enrollment.value.phase === 'idle' ? 0 : enrollment.value.speechSeconds)
// The flow shows this page only without a voiceprint at startup, so a voiceprint here comes from this flow.
// It stays enrolled when the user leaves the page and comes back.
const enrolled = computed(() => !busy.value && voiceprints.usable.length > 0)

// The circles grow with the speech that the enrollment counts. They stay full while the model works and while the user
// reviews the voice, and shrink when the voiceprint is saved. A cancelled or failed enrollment, or a deleted
// voiceprint, takes them back to the idle size.
const visualStage = computed<VoiceprintCirclesStage>(() => {
  switch (enrollment.value.phase) {
    case 'recording':
      return 'recording'
    case 'enrolling':
    case 'review':
      return 'full'
    default:
      return enrolled.value ? 'saved' : 'idle'
  }
})
const progress = computed(() => Math.min(1, speechSeconds.value / TARGET_ENROLLMENT_SPEECH_SECONDS))

// Full circles end the recording. A user who stops earlier gets the 30 s limit of the recording, which enrolls 5 s or more.
watch(speechSeconds, (seconds) => {
  if (recording.value && seconds >= TARGET_ENROLLMENT_SPEECH_SECONDS)
    finish()
})

// A new voiceprint turns on speaker recognition. The switch shows the setting, so the user can turn it off before leaving.
watch(() => enrollment.value.phase, (phase) => {
  if (phase === 'enrolled')
    speakerRecognitionEnabled.value = true
})

/** At the limit, the page offers no more enrollments and tells the user where to enroll more. */
const atLimit = computed(() => voiceprints.records.length >= ONBOARDING_VOICEPRINT_LIMIT)
const settingsPath = computed(() => [
  t('settings.title'),
  t('settings.pages.modules.title'),
  t('settings.pages.modules.hearing.title'),
  t('settings.pages.modules.hearing.voiceprint.title'),
].join(' > '))

/**
 * Deletes a voiceprint. Without another voiceprint, the page is back at its start, and speaker recognition, which the
 * enrollment turned on, turns off again.
 */
function remove(id: string) {
  voiceprints.remove(id)
  if (voiceprints.usable.length === 0)
    speakerRecognitionEnabled.value = false
}

/** Whole seconds, so the status and its announcement change once a second, not ten times. */
const progressText = computed(() => ({ seconds: Math.floor(speechSeconds.value), target: TARGET_ENROLLMENT_SPEECH_SECONDS }))

// The VAD counts speech about ten times a second while the user speaks, so a growing count means that the user speaks.
const speaking = refAutoReset(false, SPEAKING_HOLD_MS)
watch(speechSeconds, (seconds, previous) => {
  if (recording.value && seconds > previous)
    speaking.value = true
})

/** The status under the circles while the enrollment records: a short cue that encourages the user, and the counted speech. */
const coaching = computed(() => {
  if (!recording.value)
    return undefined
  const cue = progress.value >= ALMOST_THERE_PROGRESS
    ? 'almost'
    : speaking.value ? 'speaking' : speechSeconds.value > 0 ? 'more' : 'start'
  return { cue: t(`settings.dialogs.onboarding.voiceprint.cue.${cue}`), count: t('settings.dialogs.onboarding.voiceprint.count', progressText.value) }
})

/** The status under the circles in the other phases: the model at work, and the result of the last enrollment. */
const status = computed(() => {
  const value = enrollment.value
  switch (value.phase) {
    case 'enrolling':
      return { tone: 'busy' as const, text: t('settings.pages.modules.hearing.voiceprint.enrolling') }
    case 'cancelled':
      return { tone: 'info' as const, text: t('settings.pages.modules.hearing.voiceprint.result.cancelled') }
    case 'failed':
      return value.failure === 'too-short'
        ? { tone: 'info' as const, text: t('settings.pages.modules.hearing.voiceprint.result.too-short', { seconds: value.speechSeconds.toFixed(1), min: MIN_ENROLLMENT_SPEECH_SECONDS }) }
        : { tone: 'info' as const, text: t('settings.pages.modules.hearing.voiceprint.result.error', { error: value.error ?? '' }) }
    default:
      return enrolled.value ? { tone: 'ok' as const, text: t('settings.pages.modules.hearing.voiceprint.result.enrolled') } : undefined
  }
})
</script>

<template>
  <PermissionPageLayout
    :title="t('settings.dialogs.onboarding.voiceprint.title')"
    :description="t('settings.dialogs.onboarding.voiceprint.body', { seconds: TARGET_ENROLLMENT_SPEECH_SECONDS })"
  >
    <!--
      As on the other pages, the text column holds what the user reads and does, and the stage shows the result.
      During an enrollment the column keeps its content: only Cancel takes the place of Start recording, and every
      status shows under the circles. So the column does not move while the user reads the sample text aloud.
    -->
    <Alert
      v-if="enrollment.phase === 'review'"
      :class="['w-full']"
      tone="warning"
      :title="t('settings.pages.modules.hearing.voiceprint.review.title')"
    >
      {{ t('settings.pages.modules.hearing.voiceprint.review.body') }}
      <template #actions>
        <Button variant="primary" color="primary" size="sm" :label="t('settings.pages.modules.hearing.voiceprint.review.keep')" @click="keep()" />
        <Button size="sm" :label="t('settings.pages.modules.hearing.voiceprint.review.discard')" @click="discard()" />
      </template>
    </Alert>

    <template v-else-if="enrolled">
      <ol
        :aria-label="t('settings.pages.modules.hearing.voiceprint.saved')"
        :class="['m-0 w-full flex flex-col gap-2 p-0 list-none']"
      >
        <li v-for="(record, index) in voiceprints.records" :key="record.id" :class="['flex items-center gap-2']">
          <span aria-hidden="true" :class="['w-6 shrink-0 text-sm tabular-nums', 'text-neutral-400 dark:text-neutral-500']">#{{ index + 1 }}</span>
          <Input
            :class="['min-w-0 flex-1']"
            :model-value="record.label"
            :aria-label="t('settings.dialogs.onboarding.voiceprint.label', { index: index + 1 })"
            :placeholder="t('settings.pages.modules.hearing.voiceprint.label-placeholder')"
            @update:model-value="value => voiceprints.rename(record.id, String(value))"
          />
          <IconButton
            icon="i-solar:trash-bin-minimalistic-bold-duotone"
            :aria-label="t('settings.dialogs.onboarding.voiceprint.delete', { index: index + 1 })"
            :class="['size-8 rounded-lg text-lg', 'text-neutral-500 hover:text-red-500 dark:text-neutral-400 dark:hover:text-red-400']"
            @click="remove(record.id)"
          />
        </li>
      </ol>
      <!-- The button starts where the label fields start: after the number column (w-6) and its gap (gap-2). -->
      <Button
        v-if="!atLimit"
        :class="['ml-8']"
        variant="secondary"
        size="sm"
        icon="i-solar:microphone-3-bold-duotone"
        :label="t('settings.pages.modules.hearing.voiceprint.again')"
        @click="begin()"
      />
      <p :class="['m-0 text-[13px]', 'text-neutral-500 dark:text-neutral-400']">
        {{ atLimit ? t('settings.dialogs.onboarding.voiceprint.more', { path: settingsPath }) : t('settings.dialogs.onboarding.voiceprint.languages') }}
      </p>
      <FieldCheckbox
        v-model="speakerRecognitionEnabled"
        :class="['mt-2 w-full']"
        :label="t('settings.pages.modules.hearing.voiceprint.speaker-recognition.label')"
        :description="t('settings.dialogs.onboarding.voiceprint.speakerRecognition')"
      />
    </template>

    <template v-else>
      <VoiceprintSample :class="['w-full rounded-xl px-4 py-3', 'bg-neutral-100 dark:bg-neutral-800/60']" />
      <Button
        v-if="busy"
        variant="secondary"
        :label="t('settings.pages.modules.hearing.voiceprint.cancel')"
        @click="cancel()"
      />
      <Button
        v-else
        variant="primary"
        color="primary"
        icon="i-solar:microphone-3-bold-duotone"
        :label="t('settings.pages.modules.hearing.voiceprint.start')"
        @click="begin()"
      />
    </template>

    <template #stage>
      <!--
        The visual keeps one size, and the circles grow inside it, so the layout does not move while they grow. Without
        a status the circles are in the middle of the stage. A status moves them up, so a status under full circles
        stays in the stage.
      -->
      <VoiceprintCirclesVisual
        :class="[
          'w-44 @3xl:w-60',
          'transition-transform duration-300 ease-out motion-reduce:transition-none',
          (coaching || status) && '-translate-y-6',
        ]"
        :label="t('settings.dialogs.onboarding.voiceprint.progress', progressText)"
        :bands="spectrum.bands.value"
        :stage="visualStage"
        :progress="progress"
        :dimmed="enrollment.phase === 'review'"
      >
        <template v-if="coaching || status" #below>
          <div v-if="coaching" role="status" data-testid="voiceprint-coaching" :class="['flex flex-col items-center gap-0.5']">
            <p :class="['m-0 text-sm font-medium', 'text-neutral-700 dark:text-neutral-200']">
              {{ coaching.cue }}
            </p>
            <p :class="['m-0 text-xs tabular-nums', 'text-neutral-500 dark:text-neutral-400']">
              {{ coaching.count }}
            </p>
          </div>
          <!-- A long result wraps beside its mark, so the mark stays at the start of the text. -->
          <PermissionStatusLine v-else-if="status" :tone="status.tone">
            <span :class="['text-left']">{{ status.text }}</span>
          </PermissionStatusLine>
        </template>
      </VoiceprintCirclesVisual>
    </template>
  </PermissionPageLayout>
</template>
