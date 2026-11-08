<script setup lang="ts">
import { HearingConfig, IconStatusItem, RippleGrid } from '@proj-airi/stage-ui/components'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { useVoiceprintStore } from '@proj-airi/stage-ui/stores/voiceprint'
import { useWakeWordsStore } from '@proj-airi/stage-ui/stores/wake-words'
import { FieldCheckbox, FieldCombobox, FieldInput, FieldRange, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const hearingStore = useHearingStore()
const { configured, autoSendEnabled, autoSendDelay, endJudgeEnabled, rephraseEnabled, rephraseProvider, rephraseModel } = storeToRefs(hearingStore)
const wakeWords = useWakeWordsStore()
const voiceprints = useVoiceprintStore()

const providersStore = useProviderStore()
const { configuredChatProvidersMetadata } = storeToRefs(providersStore)
const rephraseProviderOptions = computed(() => [
  { label: t('settings.pages.modules.hearing.sections.section.rephrase.same-as-chat'), value: '' },
  ...configuredChatProvidersMetadata.value.map(provider => ({ label: provider.localizedName, value: provider.id })),
])
const rephraseModelOptions = computed(() => providersStore.getModelsForProvider(rephraseProvider.value).map(model => ({ label: model.name, value: model.id })))

watch(rephraseProvider, (providerId, previous) => {
  if (previous !== undefined && providerId !== previous)
    rephraseModel.value = ''
  if (providerId && providersStore.supportsModelListing(providerId))
    void providersStore.fetchModelsForProvider(providerId)
}, { immediate: true })

/**
 * Detailed Hearing pages. A green status means that the page has nothing left to set up:
 * a transcription provider is configured, every shared wake word pronunciation has a character that answers it,
 * or the user has a voiceprint that the current voiceprint model can use.
 */
const pages = computed(() => [
  {
    id: 'transcriber',
    to: '/settings/modules/hearing/transcriber',
    name: t('settings.pages.modules.hearing.transcriber.title'),
    description: t('settings.pages.modules.hearing.transcriber.description'),
    icon: 'i-solar:soundwave-bold-duotone',
    configured: configured.value,
  },
  {
    id: 'wake-words',
    to: '/settings/modules/hearing/wake-words',
    name: t('settings.pages.modules.hearing.wake-words.title'),
    description: t('settings.pages.modules.hearing.wake-words.description'),
    icon: 'i-solar:bell-bing-bold-duotone',
    configured: wakeWords.catalog.active.length > 0 && wakeWords.catalog.conflicts.every(conflict => conflict.owner),
  },
  {
    id: 'voiceprint',
    to: '/settings/modules/hearing/voiceprint',
    name: t('settings.pages.modules.hearing.voiceprint.title'),
    description: t('settings.pages.modules.hearing.voiceprint.description'),
    icon: 'i-solar:user-speak-rounded-bold-duotone',
    configured: !!voiceprints.voiceprint,
  },
])
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <SettingsCard>
      <FieldCheckbox
        v-model="hearingStore.enabled"
        :label="t('settings.pages.modules.hearing.title')"
      />
    </SettingsCard>
    <RippleGrid :items="pages" :columns="{ default: 1, sm: 2 }">
      <template #item="{ item: page }">
        <IconStatusItem
          :data-testid="`hearing-page-${page.id}`"
          :title="page.name"
          :description="page.description"
          :icon="page.icon"
          :to="page.to"
          :configured="page.configured"
        />
      </template>
    </RippleGrid>

    <div :class="['grid grid-cols-1 gap-6 md:grid-cols-2']">
      <SettingsCard>
        <h2 :class="['text-lg text-neutral-500 md:text-2xl dark:text-neutral-500']">
          {{ t('settings.pages.modules.hearing.sections.section.microphone.title') }}
        </h2>
        <HearingConfig />
      </SettingsCard>

      <SettingsCard>
        <div>
          <h2 :class="['text-lg text-neutral-500 md:text-2xl dark:text-neutral-500']">
            {{ t('settings.pages.modules.hearing.sections.section.auto-send.title') }}
          </h2>
          <div :class="['text-neutral-400 dark:text-neutral-400']">
            {{ t('settings.pages.modules.hearing.sections.section.auto-send.description') }}
          </div>
        </div>

        <FieldCheckbox
          v-model="autoSendEnabled"
          data-testid="hearing-auto-send"
          :label="t('settings.pages.modules.hearing.sections.section.auto-send.label')"
          :description="t('settings.pages.modules.hearing.sections.section.auto-send.label-description')"
        />
        <FieldRange
          v-if="autoSendEnabled"
          v-model="autoSendDelay"
          :label="t('settings.pages.modules.hearing.sections.section.auto-send.delay')"
          :description="t('settings.pages.modules.hearing.sections.section.auto-send.delay-description')"
          :min="0"
          :max="10000"
          :step="100"
          :format-value="value => value === 0 ? t('settings.pages.modules.hearing.sections.section.auto-send.immediate') : `${(value / 1000).toFixed(1)}s`"
        />

        <div :class="['border-t border-neutral-200 pt-4 dark:border-neutral-700', 'flex flex-col gap-4']">
          <div>
            <h3 :class="['text-base text-neutral-500 md:text-xl dark:text-neutral-500']">
              {{ t('settings.pages.modules.hearing.sections.section.end-judge.title') }}
            </h3>
            <div :class="['text-neutral-400 dark:text-neutral-400']">
              {{ t('settings.pages.modules.hearing.sections.section.end-judge.description') }}
            </div>
          </div>
          <FieldCheckbox
            v-model="endJudgeEnabled"
            :label="t('settings.pages.modules.hearing.sections.section.end-judge.enabled')"
            :description="t('settings.pages.modules.hearing.sections.section.end-judge.enabled-description')"
          />
        </div>

        <div :class="['border-t border-neutral-200 pt-4 dark:border-neutral-700', 'flex flex-col gap-4']">
          <div>
            <h3 :class="['text-base text-neutral-500 md:text-xl dark:text-neutral-500']">
              {{ t('settings.pages.modules.hearing.sections.section.rephrase.title') }}
            </h3>
            <div :class="['text-neutral-400 dark:text-neutral-400']">
              {{ t('settings.pages.modules.hearing.sections.section.rephrase.description') }}
            </div>
          </div>
          <FieldCheckbox
            v-model="rephraseEnabled"
            :label="t('settings.pages.modules.hearing.sections.section.rephrase.enabled')"
            :description="t('settings.pages.modules.hearing.sections.section.rephrase.enabled-description')"
          />
          <template v-if="rephraseEnabled">
            <FieldCombobox
              v-model="rephraseProvider"
              :label="t('settings.pages.modules.hearing.sections.section.rephrase.provider')"
              :description="t('settings.pages.modules.hearing.sections.section.rephrase.provider-description')"
              :options="rephraseProviderOptions"
              :placeholder="t('settings.pages.modules.hearing.sections.section.rephrase.same-as-chat')"
              layout="vertical"
            />
            <FieldCombobox
              v-if="rephraseProvider && rephraseModelOptions.length"
              v-model="rephraseModel"
              :label="t('settings.pages.modules.hearing.sections.section.rephrase.model')"
              :options="rephraseModelOptions"
              :placeholder="t('settings.pages.modules.hearing.sections.section.rephrase.model-placeholder')"
              layout="vertical"
            />
            <FieldInput
              v-else-if="rephraseProvider"
              v-model="rephraseModel"
              :label="t('settings.pages.modules.hearing.sections.section.rephrase.model')"
              :placeholder="t('settings.pages.modules.hearing.sections.section.rephrase.model-placeholder')"
            />
          </template>
        </div>
      </SettingsCard>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.hearing.title
  subtitleKey: settings.title
  icon: i-solar:microphone-3-bold-duotone
  stageTransition:
    name: slide
</route>
