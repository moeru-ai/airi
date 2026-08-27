<script setup lang="ts">
import { Live2DMotionDevtools } from '@proj-airi/stage-ui/features/devtools/motion/live2d'
import { BasicButton } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useStandardGamepad } from '../../composables/use-standard-gamepad'

const { t } = useI18n()
const router = useRouter()
const gamepad = useStandardGamepad()
</script>

<template>
  <main :class="['flex h-full min-h-0 w-full flex-col overflow-hidden', 'bg-neutral-50/80 dark:bg-neutral-950']">
    <header
      :class="[
        'drag-region flex shrink-0 items-center gap-3 border-b border-neutral-200/70 px-4 py-3',
        'bg-white/75 backdrop-blur-xl dark:border-neutral-800/70 dark:bg-neutral-950/75',
      ]"
    >
      <BasicButton
        size="sm"
        :title="t('tamagotchi.settings.devtools.pages.live2d-motion.actions.back')"
        :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.actions.back')"
        :class="['[-webkit-app-region:no-drag]']"
        @click="router.back()"
      >
        <span :class="['i-mingcute:arrow-left-line size-4']" />
      </BasicButton>
      <div :class="['min-w-0']">
        <h1 :class="['truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.title') }}
        </h1>
        <p :class="['truncate text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.description') }}
        </p>
      </div>
    </header>

    <Live2DMotionDevtools :gamepad="gamepad" />
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
  titleKey: tamagotchi.settings.devtools.pages.live2d-motion.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
