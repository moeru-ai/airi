<script setup lang="ts">
import type { OnboardingStepNextHandler, OnboardingStepPrevHandler } from './types'

import { Button, Callout } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import { useAnalytics } from '../../../../composables/use-analytics'

const props = defineProps<{
  onNext: OnboardingStepNextHandler
  onPrevious?: OnboardingStepPrevHandler
}>()

const { t } = useI18n()
const { privacyPolicyUrl } = useAnalytics()
</script>

<template>
  <div h-full flex flex-col gap-4>
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button
        type="button"
        :class="[
          'outline-none',
          props.onPrevious ? '' : 'invisible',
        ]"
        @click="props.onPrevious?.()"
      >
        <div :class="['i-solar:alt-arrow-left-line-duotone', 'h-5', 'w-5']" />
      </button>
      <h2 :class="['flex-1', 'text-center', 'text-xl', 'text-neutral-800', 'font-semibold', 'md:text-left', 'md:text-2xl', 'dark:text-neutral-100']">
        {{ t('settings.analytics.notice.title') }}
      </h2>
      <div h-5 w-5 />
    </div>

    <div flex flex-1 flex-col justify-center gap-4>
      <Callout theme="primary" :label="t('settings.analytics.notice.title')">
        <div :class="['flex', 'flex-col', 'gap-3', 'text-sm', 'leading-relaxed', 'md:text-base']">
          <p>{{ t('settings.analytics.notice.description') }}</p>
          <p>
            {{ t('settings.analytics.notice.privacyPrefix') }}
            <a
              :href="privacyPolicyUrl"
              target="_blank"
              rel="noopener noreferrer"
              :class="['underline', 'decoration-dotted']"
            >
              {{ t('settings.analytics.notice.privacyLink') }}
            </a>.
          </p>
          <p>{{ t('settings.analytics.notice.onboardingHint') }}</p>
        </div>
      </Callout>
    </div>

    <Button
      variant="primary"
      :label="t('settings.dialogs.onboarding.next')"
      @click="props.onNext"
    />
  </div>
</template>
