<script setup lang="ts">
import { computed, watch } from 'vue'
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

const status = computed(() => {
  if (check.heard.value)
    return { tone: 'ok' as const, text: t('settings.dialogs.onboarding.permissions.flow.microphone.heard') }
  if (check.quiet.value)
    return { tone: 'info' as const, text: t('settings.dialogs.onboarding.permissions.flow.microphone.quiet') }
  return { tone: 'live' as const, text: t('settings.dialogs.onboarding.permissions.flow.microphone.testing') }
})
</script>

<template>
  <PermissionPageLayout
    :title="t('settings.dialogs.onboarding.permissions.flow.microphone.title')"
    :description="t('settings.dialogs.onboarding.permissions.flow.microphone.body')"
  >
    <!--
      The result shows next to the waves that it describes. On a wide page it sits in the text, above the device
      picker. On a narrow page it sits under the waves. The hidden copy is not in the accessibility tree.
    -->
    <div v-if="granted" :class="['flex flex-col items-start gap-3', 'animate-slideUpAndFade']">
      <div :class="['hidden @3xl:block']">
        <PermissionStatusLine :tone="status.tone">
          {{ status.text }}
        </PermissionStatusLine>
      </div>
      <MicrophoneDeviceButton :level="check.level.value" />
    </div>

    <template #stage>
      <MicrophoneVoiceVisual
        :label="t('settings.dialogs.onboarding.permissions.flow.microphone.level')"
        :bands="spectrum.bands.value"
        :active="granted"
      />
      <!-- Under the band of the waves, see `microphone-voice-visual.vue`: on a narrow page the band is 60% of the stage, at most 8.5rem. -->
      <div v-if="granted" :class="['absolute left-1/2 top-[calc(50%+min(30%,4.25rem)+0.75rem)] whitespace-nowrap -translate-x-1/2 @3xl:hidden']">
        <PermissionStatusLine :tone="status.tone">
          {{ status.text }}
        </PermissionStatusLine>
      </div>
    </template>
  </PermissionPageLayout>
</template>
