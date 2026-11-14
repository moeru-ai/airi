<script setup lang="ts">
import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { VoiceprintSample } from '@proj-airi/stage-ui/components'
import { useModelAssetFailureMessage, useModelAssetStatus } from '@proj-airi/stage-ui/composables/use-model-asset-status'
import { useVoiceEnrollment } from '@proj-airi/stage-ui/composables/use-voice-enrollment'
import { isSherpawModelBundled } from '@proj-airi/stage-ui/libs/providers/providers/sherpaw/model-assets'
import { MIN_ENROLLMENT_SPEECH_SECONDS } from '@proj-airi/stage-ui/libs/voice/voice-enrollment'
import { usableVoiceprint } from '@proj-airi/stage-ui/libs/voice/voiceprint'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useVoiceprintStore } from '@proj-airi/stage-ui/stores/voiceprint'
import { Alert, Button, Checkbox, DoubleCheckButton, FieldCheckbox, Input, Progress, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const voiceprints = useVoiceprintStore()
const { speakerRecognitionEnabled } = storeToRefs(useHearingStore())
// The enrollment belongs to this page. It ends when the user leaves the page or closes the window.
const { state: enrollment, busy, begin, finish, cancel, keep, discard } = useVoiceEnrollment()
const { models } = useModelAssetStatus()
const failureMessage = useModelAssetFailureMessage()
// A bundled model needs no download, so the page does not announce one.
const modelBundled = isSherpawModelBundled(speakerModel.id)
// The model loads only while an enrollment enrolls. A download failure from an earlier enrollment must not explain a microphone error.
const modelRequested = shallowRef(false)
watch(() => enrollment.value.phase, (phase) => {
  if (phase === 'recording')
    modelRequested.value = false
  else if (phase === 'enrolling')
    modelRequested.value = true
})
const modelFailure = computed(() => modelRequested.value ? models.value.find(model => model.id === speakerModel.id)?.error : undefined)

const speechSeconds = computed(() => enrollment.value.phase === 'idle' ? 0 : enrollment.value.speechSeconds)

/** Each saved voiceprint, with the text under its label. An outdated voiceprint needs a new enrollment and cannot be enabled. */
const rows = computed(() => voiceprints.records.map((record) => {
  const usable = !!usableVoiceprint(record)
  return {
    record,
    usable,
    detail: usable
      ? t('settings.pages.modules.hearing.voiceprint.status.enrolled', {
          date: new Date(record.createdAt).toLocaleDateString(locale.value),
          seconds: Math.round(record.seconds),
        })
      : t('settings.pages.modules.hearing.voiceprint.status.outdated'),
  }
}))

/** The outcome of the last enrollment on this page. */
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
        // A failed model download also fails the enrollment with a raw message. The download failure explains it better.
        : { tone: 'orange', text: t('settings.pages.modules.hearing.voiceprint.result.error', { error: modelFailure.value ? failureMessage(modelFailure.value) : value.error ?? '' }) } as const
    default:
      return undefined
  }
})

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
        <p>{{ t('settings.pages.modules.hearing.voiceprint.languages') }}</p>
        <p>{{ t('settings.pages.modules.hearing.voiceprint.privacy') }}</p>
      </div>
    </SettingsCard>

    <SettingsCard>
      <h2 :class="['font-medium', 'text-neutral-700 dark:text-neutral-200']">
        {{ t('settings.pages.modules.hearing.voiceprint.saved') }}
      </h2>
      <p v-if="rows.length === 0" data-testid="voiceprint-empty" :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.modules.hearing.voiceprint.status.none') }}
      </p>
      <ul v-else :class="['m-0 flex flex-col gap-2 p-0 list-none']">
        <li
          v-for="row in rows"
          :key="row.record.id"
          data-testid="voiceprint-row"
          :data-state="row.usable ? 'usable' : 'outdated'"
          :class="['flex flex-col gap-3 rounded-lg px-3 py-3', 'bg-white dark:bg-neutral-900']"
        >
          <div :class="['flex flex-wrap items-center gap-3']">
            <Input
              :class="['min-w-48 flex-1']"
              :model-value="row.record.label"
              :aria-label="t('settings.pages.modules.hearing.voiceprint.label')"
              :placeholder="t('settings.pages.modules.hearing.voiceprint.label-placeholder')"
              @update:model-value="value => voiceprints.rename(row.record.id, String(value))"
            />
            <label :class="['flex items-center gap-2 text-sm', 'text-neutral-600 dark:text-neutral-300']">
              {{ t('settings.pages.modules.hearing.voiceprint.enabled') }}
              <Checkbox
                :model-value="row.usable && row.record.enabled"
                :disabled="!row.usable"
                @update:model-value="value => voiceprints.setEnabled(row.record.id, value)"
              />
            </label>
          </div>
          <div :class="['flex flex-wrap items-center justify-between gap-2']">
            <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
              {{ row.detail }}
            </p>
            <DoubleCheckButton size="sm" data-testid="voiceprint-delete" @confirm="voiceprints.remove(row.record.id)">
              {{ t('settings.pages.modules.hearing.voiceprint.delete') }}
              <template #confirm>
                {{ t('settings.pages.data.confirmations.yes') }}
              </template>
              <template #cancel>
                {{ t('settings.pages.card.cancel') }}
              </template>
            </DoubleCheckButton>
          </div>
        </li>
      </ul>
    </SettingsCard>

    <SettingsCard>
      <div :class="['flex flex-col gap-2']">
        <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.modules.hearing.voiceprint.instructions') }}
        </p>
        <VoiceprintSample />
      </div>

      <Alert v-if="enrollment.phase === 'review'" data-testid="voiceprint-review" tone="warning" :title="t('settings.pages.modules.hearing.voiceprint.review.title')">
        {{ t('settings.pages.modules.hearing.voiceprint.review.body') }}
        <template #actions>
          <Button data-testid="voiceprint-keep" variant="primary" size="sm" :label="t('settings.pages.modules.hearing.voiceprint.review.keep')" @click="keep()" />
          <Button data-testid="voiceprint-discard" size="sm" :label="t('settings.pages.modules.hearing.voiceprint.review.discard')" @click="discard()" />
        </template>
      </Alert>

      <div v-else-if="busy" data-testid="voiceprint-progress" :class="['flex flex-col gap-2']">
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

      <div v-if="enrollment.phase !== 'review'" :class="['flex flex-wrap items-center gap-2']">
        <template v-if="busy">
          <Button
            data-testid="voiceprint-finish"
            variant="primary"
            :label="t('settings.pages.modules.hearing.voiceprint.finish')"
            :disabled="enrollment.phase !== 'recording' || speechSeconds < MIN_ENROLLMENT_SPEECH_SECONDS"
            @click="finish()"
          />
          <Button
            data-testid="voiceprint-cancel"
            :label="t('settings.pages.modules.hearing.voiceprint.cancel')"
            @click="cancel()"
          />
        </template>
        <Button
          v-else
          data-testid="voiceprint-start"
          variant="primary"
          icon="i-solar:microphone-3-bold-duotone"
          :label="rows.length > 0 ? t('settings.pages.modules.hearing.voiceprint.again') : t('settings.pages.modules.hearing.voiceprint.start')"
          @click="begin()"
        />
      </div>

      <p v-if="rows.length === 0 && !modelBundled" :class="['text-xs', 'text-neutral-400 dark:text-neutral-500']">
        {{ t('settings.pages.modules.hearing.voiceprint.download') }}
      </p>
    </SettingsCard>

    <SettingsCard>
      <!-- The setting keeps its value without an enabled voiceprint, but the voice host compares nothing then. -->
      <FieldCheckbox
        v-model="speakerRecognitionEnabled"
        data-testid="speaker-recognition"
        :disabled="voiceprints.matching.length === 0"
        :label="t('settings.pages.modules.hearing.voiceprint.speaker-recognition.label')"
        :description="t('settings.pages.modules.hearing.voiceprint.speaker-recognition.description')"
      />
      <p v-if="voiceprints.matching.length === 0" :class="['text-xs', 'text-neutral-400 dark:text-neutral-500']">
        {{ t('settings.pages.modules.hearing.voiceprint.speaker-recognition.needs-voiceprint') }}
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
