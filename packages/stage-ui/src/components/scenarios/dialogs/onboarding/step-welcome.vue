<script setup lang="ts">
import type { OnboardingStepNextHandler } from './types'

import { all } from '@proj-airi/i18n'
import { Button, FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import onboardingLogo from '../../../../assets/onboarding.avif'

import { useAuthStore } from '../../../../stores/auth'
import { useOnboardingStore } from '../../../../stores/onboarding'
import { useSettingsGeneral } from '../../../../stores/settings'

interface Props {
  onNext: OnboardingStepNextHandler
}

const props = defineProps<Props>()
const { t } = useI18n()
const authStore = useAuthStore()
const onboardingStore = useOnboardingStore()
const settingsStore = useSettingsGeneral()
const { language } = storeToRefs(settingsStore)

const languages = computed(() => {
  return Object.entries(all).map(([value, label]) => ({ value, label }))
})

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
    <div :class="['mb-2', 'flex', 'flex-1', 'flex-col', 'justify-center', 'text-center', 'md:mb-8']">
      <div
        v-motion
        :initial="{ opacity: 0, scale: 0.5 }"
        :enter="{ opacity: 1, scale: 1 }"
        :duration="500"
        :class="['mb-1', 'flex', 'justify-center', 'md:mb-4', 'md:pt-8', 'lg:pt-16']"
      >
        <img :src="onboardingLogo" max-h="50" aspect-square h-auto w-auto object-cover>
      </div>
      <h2
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="500"
        :class="['mb-0', 'text-3xl', 'text-neutral-800', 'font-bold', 'md:mb-2', 'dark:text-neutral-100']"
      >
        {{ t('settings.dialogs.onboarding.title') }}
      </h2>
      <p
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="500"
        :delay="100"
        :class="['text-sm', 'text-neutral-600', 'md:text-lg', 'dark:text-neutral-400']"
      >
        {{ t('settings.dialogs.onboarding.description') }}
      </p>
      <div
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="500"
        :delay="150"
        :class="['mx-auto', 'mt-6', 'w-full', 'max-w-lg', 'rounded-2xl', 'bg-neutral-100/80', 'backdrop-blur-sm', 'dark:bg-neutral-800/80', 'p-4']"
      >
        <FieldCombobox
          v-model="language"
          :class="['w-full']"
          :label="t('settings.language.title')"
          :description="t('settings.language.description')"
          :options="languages"
          layout="horizontal"
        />
      </div>
    </div>
    <div :class="['flex', 'flex-col', 'gap-3', 'md:flex-row']">
      <Button
        v-motion
        :initial="{ opacity: 0 }"
        :enter="{ opacity: 1 }"
        :duration="500"
        :delay="200"
        :label="t('settings.dialogs.onboarding.loginAction')"
        :class="['flex-1']"
        @click="handleLogin"
      />
      <Button
        v-motion
        :initial="{ opacity: 0 }"
        :enter="{ opacity: 1 }"
        :duration="500"
        :delay="250"
        variant="secondary"
        :label="t('settings.dialogs.onboarding.setupWithoutSigningIn')"
        :class="['flex-1']"
        @click="handleLocalSetup"
      />
    </div>
  </div>
</template>
