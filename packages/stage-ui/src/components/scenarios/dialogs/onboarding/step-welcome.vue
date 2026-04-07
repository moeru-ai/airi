<script setup lang="ts">
import type { OnboardingStepNextHandler } from './types'

import { all } from '@proj-airi/i18n'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
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
  <div relative h-full flex flex-col>
    <div :class="['absolute', 'right-0', 'top-0', 'z-10']">
      <DropdownMenuRoot>
        <DropdownMenuTrigger
          :class="[
            'h-8 w-8',
            'flex items-center justify-center',
            'rounded-lg',
            'text-neutral-500 transition-colors duration-200',
            'hover:bg-neutral-100/80 hover:text-neutral-700',
            'dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:hover:text-neutral-200',
          ]"
          :aria-label="t('settings.language.title')"
        >
          <div class="i-lucide:globe" h-6 w-6 />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            align="end"
            side="bottom"
            :side-offset="6"
            :class="[
              'z-10000 min-w-36 rounded-xl border p-1 shadow-lg outline-none backdrop-blur-md',
              'border-neutral-200/80 bg-neutral-100/80 text-neutral-700',
              'dark:border-neutral-700/60 dark:bg-neutral-800/80 dark:text-neutral-100',
            ]"
          >
            <DropdownMenuItem
              v-for="lang in languages"
              :key="lang.value"
              :class="[
                'flex cursor-pointer select-none items-center rounded-lg px-3 py-2',
                'text-sm leading-none outline-none',
                'data-[highlighted]:bg-primary-50/80 dark:data-[highlighted]:bg-primary-900/40',
                'transition-colors duration-150 ease-in-out',
                lang.value === language ? 'text-primary-500 dark:text-primary-300' : '',
              ]"
              @select="() => language = lang.value"
            >
              {{ lang.label }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
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
