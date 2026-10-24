<script setup lang="ts">
import { Callout, FieldCheckbox, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import MicrophonePicker from '../../settings/microphone-picker.vue'
import OptionList from '../../settings/option-list.vue'
import WakeWordStatus from './wake-word-status.vue'

import { usePushToTalkTrigger } from '../../../../composables/push-to-talk-trigger'
import { useBreakpoints } from '../../../../composables/use-breakpoints'
import { useHearingStore } from '../../../../stores/modules/hearing'
import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'

const props = defineProps<{
  /** Runs before the permission request when the user turns the microphone on. Other requests skip this hook. */
  beforeEnable?: () => Promise<void>
}>()

const { t } = useI18n()
const { inputMode } = storeToRefs(useHearingStore())
const { available: pushToTalkAvailable, stranded: pushToTalkStranded } = usePushToTalkTrigger()
const deviceStore = useSettingsAudioDevice()
const { audioInputOptions, enabled, error, permission, selectedAudioInput } = storeToRefs(deviceStore)
// A phone shows this config in a bottom drawer. A select there opens a second floating layer, so choices are rows.
const { isDesktop } = useBreakpoints()

const inputModeOptions = computed(() => [
  {
    value: 'always-on' as const,
    label: t('settings.pages.modules.hearing.sections.section.input-mode.always-on'),
    description: t('settings.pages.modules.hearing.sections.section.input-mode.always-on-description'),
  },
  {
    value: 'push-to-talk' as const,
    label: t('settings.pages.modules.hearing.sections.section.input-mode.push-to-talk'),
    // Without a trigger the mode leaves the microphone closed, so the option stays visible but cannot be chosen.
    description: pushToTalkAvailable.value
      ? t('settings.pages.modules.hearing.sections.section.input-mode.push-to-talk-description')
      : t('settings.pages.modules.hearing.sections.section.input-mode.push-to-talk-unavailable'),
    disabled: !pushToTalkAvailable.value,
  },
  {
    value: 'wake-word' as const,
    label: t('settings.pages.modules.hearing.sections.section.input-mode.wake-word'),
    description: t('settings.pages.modules.hearing.sections.section.input-mode.wake-word-description'),
  },
])

/** True while the enable action waits for the host hook or the permission prompt. The switch ignores input until then. */
const enabling = shallowRef(false)

/**
 * Only this explicit switch action asks for microphone permission. Rendering the controls never opens the microphone.
 * A denied request leaves the switch off. The device store keeps the reason in `error`, which the callout shows.
 */
async function setMicrophoneEnabled(value: boolean) {
  if (enabling.value)
    return
  if (!value) {
    enabled.value = false
    return
  }

  enabling.value = true
  try {
    if (props.beforeEnable)
      await props.beforeEnable()
    if (await deviceStore.askPermission())
      enabled.value = true
  }
  finally {
    enabling.value = false
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-4']">
    <FieldSelect
      v-if="isDesktop"
      v-model="inputMode"
      data-testid="hearing-input-mode"
      :label="t('settings.pages.modules.hearing.sections.section.input-mode.label')"
      :description="t('settings.pages.modules.hearing.sections.section.input-mode.description')"
      :options="inputModeOptions"
      layout="vertical"
    />
    <div v-else data-testid="hearing-input-mode" :class="['flex flex-col gap-2']">
      <div :class="['flex flex-col gap-1']">
        <span :class="['text-sm font-medium']">{{ t('settings.pages.modules.hearing.sections.section.input-mode.label') }}</span>
        <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ t('settings.pages.modules.hearing.sections.section.input-mode.description') }}</span>
      </div>
      <OptionList v-model="inputMode" :label="t('settings.pages.modules.hearing.sections.section.input-mode.label')" :options="inputModeOptions" />
    </div>
    <WakeWordStatus v-if="inputMode === 'wake-word'" />
    <Callout
      v-if="pushToTalkStranded"
      data-testid="hearing-input-mode-stranded"
      theme="orange"
      :label="t('settings.pages.modules.hearing.sections.section.input-mode.stranded-title')"
    >
      {{ t('settings.pages.modules.hearing.sections.section.input-mode.stranded-description') }}
    </Callout>

    <FieldCheckbox
      data-testid="hearing-microphone-switch"
      :model-value="enabled"
      :disabled="enabling"
      :label="t('settings.pages.modules.hearing.sections.section.microphone.label')"
      :description="t('settings.pages.modules.hearing.sections.section.microphone.description')"
      @update:model-value="setMicrophoneEnabled"
    />

    <MicrophonePicker
      v-model="selectedAudioInput"
      :label="t('settings.pages.modules.hearing.sections.section.input-device.label')"
      :description="t('settings.pages.modules.hearing.sections.section.input-device.description')"
      :options="audioInputOptions"
      :placeholder="t('settings.pages.modules.hearing.sections.section.input-device.placeholder')"
      :permission="permission"
      :request-access="deviceStore.askPermission"
    />

    <Callout
      v-if="error"
      data-testid="hearing-microphone-error"
      theme="orange"
      :label="t('settings.pages.modules.hearing.sections.section.microphone.error')"
    >
      {{ error }}
    </Callout>
  </div>
</template>
