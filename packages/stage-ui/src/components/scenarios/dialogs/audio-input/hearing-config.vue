<script setup lang="ts">
import type { HearingInputMode } from '../../../../stores/settings/audio-device'

import { Callout, FieldCheckbox, FieldCombobox, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSettingsAudioDevice } from '../../../../stores'
import { useHearingRuntimeStore } from '../../../../stores/hearing-runtime'

const props = withDefaults(defineProps<{ granted?: boolean }>(), { granted: true })
const { t } = useI18n()
const deviceStore = useSettingsAudioDevice()
const { audioInputOptions, enabled, mode, selectedAudioInput, permissionGranted, error } = storeToRefs(deviceStore)
const { preparation, preparationError } = storeToRefs(useHearingRuntimeStore())

const permissionPending = shallowRef(false)

async function setMicrophoneEnabled(value: boolean) {
  if (!value) {
    enabled.value = false
    return
  }
  permissionPending.value = true
  try {
    if (!permissionGranted.value)
      await deviceStore.askPermission()
    if (permissionGranted.value)
      enabled.value = true
  }
  catch {
    // The device store retains permission failures for the callout below.
  }
  finally {
    permissionPending.value = false
  }
}

const modeOptions = computed<{ label: string, value: HearingInputMode }[]>(() => [
  { label: t('settings.pages.modules.hearing.input-mode.off'), value: 'off' },
  { label: t('settings.pages.modules.hearing.input-mode.push-to-talk'), value: 'push-to-talk' },
  { label: t('settings.pages.modules.hearing.input-mode.wake-word'), value: 'wake-word' },
  { label: t('settings.pages.modules.hearing.input-mode.always'), value: 'always' },
])
</script>

<template>
  <div :class="['flex flex-col gap-4']">
    <FieldSelect
      v-model="mode"
      :label="t('settings.pages.modules.hearing.input-mode.label')"
      :description="t('settings.pages.modules.hearing.input-mode.description')"
      :options="modeOptions"
      layout="vertical"
    />
    <FieldCheckbox
      v-if="mode === 'always' || mode === 'wake-word'"
      :model-value="enabled"
      :disabled="permissionPending"
      :label="t('settings.pages.modules.hearing.microphone.label')"
      :description="t('settings.pages.modules.hearing.microphone.description')"
      @update:model-value="setMicrophoneEnabled"
    />
    <Callout
      v-if="mode === 'wake-word' && preparation === 'preparing'"
      theme="orange"
      :label="t('settings.pages.modules.hearing.calling-status.preparing')"
    />
    <Callout
      v-if="mode === 'wake-word' && preparation === 'unconfigured'"
      theme="orange"
      :label="t('settings.pages.modules.hearing.calling-status.unconfigured')"
    />
    <Callout
      v-if="mode === 'wake-word' && preparation === 'error'"
      theme="orange"
      :label="t('settings.pages.modules.hearing.calling-status.error')"
    >
      {{ preparationError }}
    </Callout>
    <p v-if="mode === 'wake-word' && preparation === 'ready'" role="status" :class="['text-sm text-neutral-600 dark:text-neutral-300']">
      {{ t('settings.pages.modules.hearing.calling-status.ready') }}
    </p>
    <FieldCombobox
      v-model="selectedAudioInput"
      :label="t('settings.pages.modules.hearing.input-device.label')"
      :description="t('settings.pages.modules.hearing.input-device.description')"
      :options="audioInputOptions"
      :placeholder="t('settings.pages.modules.hearing.input-device.placeholder')"
      side="top"
      layout="vertical"
    />
    <Callout v-if="error" theme="orange" :label="error" />
    <Callout v-if="!props.granted" theme="orange" :label="t('settings.pages.modules.hearing.permission-required')" />
  </div>
</template>
