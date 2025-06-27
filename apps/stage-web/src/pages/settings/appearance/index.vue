<script setup lang="ts">
import { IconItem } from '@proj-airi/stage-ui/components'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const settings = computed(() => [
  {
    title: t('settings.pages.themes.general.title'),
    description: t('settings.pages.themes.general.description'),
    icon: 'i-solar:emoji-funny-square-bold-duotone',
    to: '/settings/appearance/general',
  },
  {
    title: t('settings.pages.themes.color-scheme.title'),
    description: t('settings.pages.themes.color-scheme.description'),
    icon: 'i-solar:pallete-2-bold-duotone',
    to: '/settings/appearance/color-scheme',
  },
  {
    title: t('settings.pages.themes.developer.title'),
    description: t('settings.pages.themes.developer.description'),
    icon: 'i-solar:code-bold-duotone',
    to: '/settings/appearance/developer',
  },
])
</script>

<template>
  <div flex="~ col gap-4" font-normal>
    <div />
    <div flex="~ col gap-4">
      <IconItem
        v-for="(setting, index) in settings"
        :key="setting.to"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :style="{
          transitionDelay: `${index * 50}ms`, // delay between each item, unocss doesn't support dynamic generation of classes now
        }"
        :title="setting.title"
        :description="setting.description"
        :icon="setting.icon"
        :to="setting.to"
      />
    </div>
    <div
      v-motion
      text="neutral-200/50 dark:neutral-600/20" pointer-events-none
      fixed top="[calc(100dvh-12rem)]" bottom-0 right--10 z--1
      :initial="{ scale: 0.9, opacity: 0, rotate: 180 }"
      :enter="{ scale: 1, opacity: 1, rotate: 0 }"
      :duration="500"
      size-60
      flex items-center justify-center
    >
      <div v-motion text="60" i-solar:settings-bold-duotone />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
