<script setup lang="ts">
import type { OnboardingStepNextHandler } from './types'

import { all } from '@proj-airi/i18n'
import { Button, DropdownMenu } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { DropdownMenuItem } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import onboardingLogo from '../../../../assets/onboarding.avif'

import { AIRI_FLUX_URL, AIRI_TERMS_URL } from '../../../../constants/public-links'
import { useAuthStore } from '../../../../stores/auth'
import { useOnboardingStore } from '../../../../stores/onboarding'
import { useSettingsGeneral } from '../../../../stores/settings'

interface Props {
  customProviderSetupEnabled: boolean
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

async function handleLogin() {
  onboardingStore.showingSetup = false
  await authStore.requestLogin()
}

function handleLocalSetup() {
  props.onNext()
}
</script>

<template>
  <div relative h-full flex flex-col>
    <div :class="['absolute', 'right-0', 'top-0', 'z-10']">
      <DropdownMenu
        align="end"
        :content-class="['min-w-36']"
        variant="blurry"
      >
        <template #trigger>
          <button
            :class="[
              'h-8 w-8',
              'flex items-center justify-center',
              'rounded-lg',
              'outline-none',
              'text-neutral-500 transition-colors duration-200',
              'hover:bg-neutral-100/80 hover:text-neutral-700',
              'dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:hover:text-neutral-200',
              'data-[state=open]:bg-neutral-100/80 dark:data-[state=open]:bg-neutral-800/80',
            ]"
            :aria-label="t('settings.language.title')"
            type="button"
          >
            <div class="i-lucide:globe" h-5 w-5 />
          </button>
        </template>

        <DropdownMenuItem
          v-for="lang in languages"
          :key="lang.value"
          :class="[
            'flex cursor-pointer select-none items-center rounded-lg px-3 py-2',
            'text-sm leading-none outline-none',
            'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
            'transition-colors duration-150 ease-in-out',
            lang.value === language ? 'text-primary-500 dark:text-primary-300' : '',
          ]"
          @select="() => language = lang.value"
        >
          {{ lang.label }}
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
    <div :class="['mb-2', 'flex', 'flex-1', 'flex-col', 'justify-center', 'text-center', 'md:mb-8']">
      <div
        v-motion
        :initial="{ opacity: 0, scale: 0.5 }"
        :enter="{ opacity: 1, scale: 1 }"
        :duration="500"
        :class="['mb-1', 'flex', 'justify-center', 'md:mb-4', 'md:pt-8', 'lg:pt-16']"
      >
        <img :src="onboardingLogo" max-h="50" aspect-square h-auto w-auto select-none object-cover>
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
    </div>
    <div :class="['mx-2 flex flex-col items-stretch gap-2']">
      <Button
        v-motion="{
          initial: { opacity: 0, y: 8 },
          enter: { opacity: 1, y: 0 },
          duration: 500,
          delay: 200,
        }"
        color="primary"
        variant="primary"
        size="lg"
        :label="t('settings.dialogs.onboarding.loginAction')"
        @click="handleLogin"
      />
      <Button
        v-if="props.customProviderSetupEnabled"
        v-motion="{
          initial: { opacity: 0 },
          enter: { opacity: 1 },
          duration: 500,
          delay: 250,
        }"
        variant="secondary"
        :outline="false"
        :class="['bg-transparent! text-neutral-600 dark:text-neutral-300']"
        :label="t('settings.dialogs.onboarding.setupWithoutSigningIn')"
        @click="handleLocalSetup"
      />
    </div>
    <nav
      v-motion="{
        initial: { opacity: 0 },
        enter: { opacity: 1 },
        duration: 500,
        delay: 300,
      }"
      :class="[
        'mx-2 mb-1 mt-8 md:mt-10',
        'flex items-center justify-center gap-3',
        'text-xs text-neutral-500 dark:text-neutral-500',
      ]"
    >
      <a
        :href="AIRI_FLUX_URL"
        target="_blank"
        rel="noopener noreferrer"
        :class="['underline-offset-4 transition-colors hover:text-neutral-700 hover:underline dark:hover:text-neutral-200']"
      >
        {{ t('settings.dialogs.onboarding.pricingLink') }}
      </a>
      <span aria-hidden="true" :class="['size-0.5 rounded-full bg-current']" />
      <a
        :href="AIRI_TERMS_URL"
        target="_blank"
        rel="noopener noreferrer"
        :class="['underline-offset-4 transition-colors hover:text-neutral-700 hover:underline dark:hover:text-neutral-200']"
      >
        {{ t('settings.dialogs.onboarding.termsLink') }}
      </a>
    </nav>
  </div>
</template>
