<script setup lang="ts">
import { all } from '@proj-airi/i18n'
import { Button, FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'

import onboardingLogo from '../../../../assets/onboarding.avif'

import { useAuthStore } from '../../../../stores/auth'
import { useSettingsGeneral } from '../../../../stores/settings'
import { OnboardingContextKey } from './utils'

const { t } = useI18n()
const context = inject(OnboardingContextKey)!
const authStore = useAuthStore()
const settingsStore = useSettingsGeneral()
const { language } = storeToRefs(settingsStore)

const languages = computed(() => {
  return Object.entries(all).map(([value, label]) => ({ value, label }))
})

function handleLogin() {
  authStore.isLoginOpen = true
}

function handleLocalSetup() {
  context.handleNextStep()
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
        :class="['mx-auto', 'mt-6', 'w-full', 'max-w-sm', 'rounded-2xl', 'bg-neutral-100/80', 'backdrop-blur-sm', 'dark:bg-neutral-800/80', 'p-4']"
      >
        <FieldCombobox
          v-model="language"
          :class="['w-full']"
          :label="t('settings.language.title')"
          :description="t('settings.language.description')"
          :options="languages"
          layout="vertical"
        />
      </div>
    </div>
    <div flex="~ row gap-3">
      <Button
        v-motion
        :initial="{ opacity: 0 }"
        :visible="{ opacity: 1 }"
        :duration="500"
        :delay="200"
        :label="t('settings.dialogs.onboarding.loginAction')"
        class="flex-1"
        @click="handleLogin"
      />
      <Button
        v-motion
        :initial="{ opacity: 0 }"
        :visible="{ opacity: 1 }"
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
