<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MicrophoneDeviceButton from './microphone-device-button.vue'
import MicrophoneVoiceVisual from './microphone-voice-visual.vue'
import PermissionPageLayout from './permission-page-layout.vue'
import PermissionStatusLine from './permission-status-line.vue'

import { useMicrophoneCheck } from '../../../composables/permissions/use-microphone-check'
import { useMicrophoneSpectrum } from '../../../composables/permissions/use-microphone-spectrum'

const props = defineProps<{
  /** True while the system allows the microphone. The page listens only then. */
  granted: boolean
}>()

/** True after the microphone heard speech. The flow continues only then. */
const heard = defineModel<boolean>('heard', { default: false })

const { t } = useI18n()
const check = useMicrophoneCheck(() => props.granted)
watch(check.heard, value => heard.value = value, { immediate: true })
/** The visual keeps following the voice after the check heard it, so the page stays alive while the user talks. */
const spectrum = useMicrophoneSpectrum(() => props.granted)
</script>

<template>
  <PermissionPageLayout
    :title="t('settings.dialogs.onboarding.permissions.flow.microphone.title')"
    :description="t('settings.dialogs.onboarding.permissions.flow.microphone.body')"
  >
    <div v-if="granted" :class="['mt-2 flex flex-col items-start gap-3', 'animate-slideUpAndFade']">
      <MicrophoneDeviceButton :level="check.level.value" />
      <PermissionStatusLine v-if="check.heard.value" tone="ok">
        {{ t('settings.dialogs.onboarding.permissions.flow.microphone.heard') }}
      </PermissionStatusLine>
      <PermissionStatusLine v-else-if="check.quiet.value" tone="info">
        {{ t('settings.dialogs.onboarding.permissions.flow.microphone.quiet') }}
      </PermissionStatusLine>
      <PermissionStatusLine v-else tone="live">
        {{ t('settings.dialogs.onboarding.permissions.flow.microphone.testing') }}
      </PermissionStatusLine>
    </div>

    <template #stage>
      <MicrophoneVoiceVisual
        :label="t('settings.dialogs.onboarding.permissions.flow.microphone.level')"
        :bands="spectrum.bands.value"
        :active="granted"
      />
    </template>
  </PermissionPageLayout>
</template>
