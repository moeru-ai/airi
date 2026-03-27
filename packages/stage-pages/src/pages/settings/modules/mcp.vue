<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" flex="~ col items-center justify-center gap-4" min-h-60 rounded-xl p-8 text-center>
    <div text="6xl neutral-300 dark:neutral-700" i-solar:settings-minimalistic-bold-duotone animate-pulse />
    <div flex="~ col gap-2">
      <h2 class="text-2xl text-neutral-600 font-bold dark:text-neutral-400">
        {{ t('settings.pages.modules.mcp-server.title') }}
      </h2>
      <p class="max-w-md text-neutral-500 dark:text-neutral-500">
        {{ t('settings.wip.description') }}
      </p>
    </div>
  </div>

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:server-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.mcp-server.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
