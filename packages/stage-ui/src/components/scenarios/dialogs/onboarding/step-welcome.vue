<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'

import onboardingLogo from '../../../../assets/onboarding.avif'

import { OnboardingContextKey } from './utils'

const { t } = useI18n()
const context = inject(OnboardingContextKey)!
</script>

<template>
  <div h-full flex flex-col>
    <div class="mb-2 text-center md:mb-8" flex flex-1 flex-col justify-center>
      <div
        v-motion
        :initial="{ opacity: 0, scale: 0.5 }"
        :visible="{ opacity: 1, scale: 1 }"
        :duration="500"
        class="mb-1 flex justify-center md:mb-4 lg:pt-16 md:pt-8"
      >
        <img :src="onboardingLogo" max-h="50" aspect-square h-auto w-auto object-cover>
      </div>
      <h2
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :visible="{ opacity: 1, y: 0 }"
        :duration="500"
        class="mb-0 text-3xl text-neutral-800 font-bold md:mb-2 dark:text-neutral-100"
      >
        {{ t('settings.dialogs.onboarding.title') }}
      </h2>
      <p
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :visible="{ opacity: 1, y: 0 }"
        :duration="500"
        :delay="100"
        class="text-sm text-neutral-600 md:text-lg dark:text-neutral-400"
      >
        {{ t('settings.dialogs.onboarding.description') }}
      </p>
    </div>
    <Button
      v-motion
      :initial="{ opacity: 0 }"
      :visible="{ opacity: 1 }"
      :duration="500"
      :delay="200"
      :label="t('settings.dialogs.onboarding.start')"
      @click="context.handleNextStep"
    />
  </div>
</template>
