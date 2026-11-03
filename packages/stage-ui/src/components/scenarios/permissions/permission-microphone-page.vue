<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MicrophoneDeviceButton from './microphone-device-button.vue'
import PermissionPageLayout from './permission-page-layout.vue'
import PermissionStatusLine from './permission-status-line.vue'

import { useMicrophoneCheck } from '../../../composables/permissions/use-microphone-check'

const props = defineProps<{
  /** True while the system allows the microphone. The page listens only then. */
  granted: boolean
}>()

/** True after the microphone heard speech. The flow continues only then. */
const heard = defineModel<boolean>('heard', { default: false })

const { t } = useI18n()
const check = useMicrophoneCheck(() => props.granted)
watch(check.heard, value => heard.value = value, { immediate: true })

/**
 * The two soft circles grow with the level. They have no outline.
 * At rest they sit inside the core, so their edges do not show as a ring around it.
 */
/** Room noise reads up to about 0.2. The circles grow only above it, so a quiet room shows the still core. */
const NOISE_FLOOR = 0.2
const voice = computed(() => Math.max(0, check.level.value - NOISE_FLOOR) / (1 - NOISE_FLOOR))
const outerScale = computed(() => 0.9 + voice.value * 1.05)
const innerScale = computed(() => 0.9 + voice.value * 0.6)
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
      <div
        role="img"
        :aria-label="t(check.heard.value ? 'settings.dialogs.onboarding.permissions.flow.microphone.heard' : 'settings.dialogs.onboarding.permissions.flow.microphone.level')"
        :class="['relative size-33 flex items-center justify-center']"
      >
        <div :class="['absolute inset-0 rounded-full bg-primary-500/8 transition-transform duration-75 ease-linear']" :style="{ transform: `scale(${outerScale})` }" />
        <div :class="['absolute inset-0 rounded-full bg-primary-500/14 transition-transform duration-75 ease-linear']" :style="{ transform: `scale(${innerScale})` }" />
        <div
          :class="[
            'relative size-33 flex items-center justify-center rounded-full transition-colors duration-300',
            check.heard.value
              ? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300'
              : granted
                ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/70 dark:text-primary-200'
                : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
          ]"
        >
          <span v-if="check.heard.value" :class="['i-mingcute:check-line', 'size-13 animate-bounce-in animate-duration-300']" aria-hidden="true" />
          <span v-else :class="['i-mingcute:mic-line', 'size-12']" aria-hidden="true" />
        </div>
      </div>
    </template>
  </PermissionPageLayout>
</template>
