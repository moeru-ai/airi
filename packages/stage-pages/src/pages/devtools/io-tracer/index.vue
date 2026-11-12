<script setup lang="ts">
import { IOTracerDevtools } from '@proj-airi/stage-ui/features/trace/io-tracer'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <IOTracerDevtools>
    <template #leading>
      <button
        type="button"
        :title="t('tamagotchi.settings.devtools.pages.io-tracer.actions.back')"
        :aria-label="t('tamagotchi.settings.devtools.pages.io-tracer.actions.back')"
        :class="[
          'flex size-7 shrink-0 items-center justify-center rounded-md [-webkit-app-region:no-drag]',
          'text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100',
        ]"
        @click="router.back()"
      >
        <span :class="['i-mingcute:arrow-left-line size-4']" />
      </button>
    </template>
  </IOTracerDevtools>
</template>

<route lang="yaml">
meta:
  layout: plain
  titleKey: tamagotchi.settings.devtools.pages.io-tracer.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
