<script setup lang="ts">
import type { SelectTabOption } from '@proj-airi/ui'

import type { HearingInputMode } from '../../../../stores/settings/audio-device'

import { Callout, Checkbox, FieldCombobox, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSettingsAudioDevice } from '../../../../stores'

const props = withDefaults(defineProps<{ granted?: boolean }>(), { granted: true })
const { t } = useI18n()
const { audioInputOptions, enabled, mode, selectedAudioInput, wakeWordPreparation, wakeWordPreparationError } = storeToRefs(useSettingsAudioDevice())

const modeOptions = computed<SelectTabOption<HearingInputMode>[]>(() => [
  { label: t('settings.pages.modules.hearing.input-mode.off'), value: 'off' },
  { label: t('settings.pages.modules.hearing.input-mode.push-to-talk'), value: 'push-to-talk' },
  { label: t('settings.pages.modules.hearing.input-mode.wake-word'), value: 'wake-word' },
  { label: t('settings.pages.modules.hearing.input-mode.always'), value: 'always' },
])
</script>

<template>
  <div :class="['flex flex-col gap-4']">
    <div :class="['flex flex-col gap-3']">
      <div :class="['flex items-start justify-between gap-3']">
        <div>
          <div :class="['text-sm font-medium']">
            {{ t('settings.pages.modules.hearing.input-mode.label') }}
          </div>
          <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.modules.hearing.input-mode.description') }}
          </div>
        </div>
        <Checkbox
          v-if="mode === 'always' || mode === 'wake-word'"
          v-model="enabled"
          :aria-label="t('settings.pages.modules.hearing.microphone.label')"
          :class="['shrink-0']"
        />
      </div>
      <SelectTab
        v-model="mode"
        :options="modeOptions"
        size="xs"
        tab-space="compact"
        :class="['w-full']"
      />
    </div>
    <Callout
      v-if="mode === 'wake-word' && wakeWordPreparation === 'preparing'"
      theme="orange"
      :label="t('settings.pages.modules.hearing.input-mode.preparing')"
    />
    <Callout
      v-if="mode === 'wake-word' && wakeWordPreparation === 'unconfigured'"
      theme="orange"
      :label="t('settings.pages.modules.hearing.input-mode.unconfigured')"
    />
    <Callout
      v-if="mode === 'wake-word' && wakeWordPreparation === 'error'"
      theme="orange"
      :label="t('settings.pages.modules.hearing.input-mode.failed')"
    >
      {{ wakeWordPreparationError }}
    </Callout>
    <FieldCombobox
      v-model="selectedAudioInput"
      :label="t('settings.pages.modules.hearing.input-device.label')"
      :description="t('settings.pages.modules.hearing.input-device.description')"
      :options="audioInputOptions"
      :placeholder="t('settings.pages.modules.hearing.input-device.placeholder')"
      side="top"
      layout="vertical"
    />
    <Callout v-if="!props.granted" theme="orange" :label="t('settings.pages.modules.hearing.permission-required')" />
  </div>
</template>
