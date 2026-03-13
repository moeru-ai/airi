<script setup lang="ts">
import type { OnboardingStepNextHandler } from './types'

import { Button } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import onboardingLogo from '../../../../assets/onboarding.avif'

import { useAuthStore } from '../../../../stores/auth'
import { useOnboardingStore } from '../../../../stores/onboarding'

interface Props {
  onNext: OnboardingStepNextHandler
}

const props = defineProps<Props>()
const { t } = useI18n()
const authStore = useAuthStore()
const onboardingStore = useOnboardingStore()

function handleLogin() {
  onboardingStore.showingSetup = false
  authStore.needsLogin = true
}

function handleLocalSetup() {
  props.onNext()
}
</script>

<template>
  <div h-full flex flex-col>
    <div class="mb-2 text-center md:mb-8" flex flex-1 flex-col justify-center>
      <div
        v-motion
        :initial="{ opacity: 0, scale: 0.5 }"
        :enter="{ opacity: 1, scale: 1 }"
        :duration="500"
        class="mb-1 flex justify-center md:mb-4 lg:pt-16 md:pt-8"
      >
        <img :src="onboardingLogo" max-h="50" aspect-square h-auto w-auto object-cover>
      </div>
      <h2
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="500"
        class="mb-0 text-3xl text-neutral-800 font-bold md:mb-2 dark:text-neutral-100"
      >
        {{ t('settings.dialogs.onboarding.title') }}
      </h2>
      <p
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="500"
        :delay="100"
        class="text-sm text-neutral-600 md:text-lg dark:text-neutral-400"
      >
        {{ t('settings.dialogs.onboarding.description') }}
      </p>
    </div>
    <div flex="~ gap-3" class="flex-col md:flex-row">
      <Button
        v-motion
        :initial="{ opacity: 0 }"
        :enter="{ opacity: 1 }"
        :duration="500"
        :delay="200"
        :label="t('settings.dialogs.onboarding.loginAction')"
        class="flex-1"
        @click="handleLogin"
      />
      <Button
        v-motion
        :initial="{ opacity: 0 }"
        :enter="{ opacity: 1 }"
        :duration="500"
        :delay="250"
        variant="secondary"
        :label="t('settings.dialogs.onboarding.localSetup')"
        class="flex-1"
        @click="handleLocalSetup"
      />
    </div>
  </div>
</template>
