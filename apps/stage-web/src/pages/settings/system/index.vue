<script setup lang="ts">
import { IconItem, RippleGrid } from '@proj-airi/stage-ui/components'
import { useRippleGridState } from '@proj-airi/stage-ui/composables/use-ripple-grid-state'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState()

const settings = computed(() => [
  {
    title: t('settings.pages.system.general.title'),
    description: t('settings.pages.system.general.description'),
    icon: 'i-solar:emoji-funny-square-bold-duotone',
    to: '/settings/system/general',
  },
  {
    title: t('settings.pages.system.color-scheme.title'),
    description: t('settings.pages.system.color-scheme.description'),
    icon: 'i-solar:pallete-2-bold-duotone',
    to: '/settings/system/color-scheme',
  },
  {
    title: t('settings.pages.system.developer.title'),
    description: t('settings.pages.system.developer.description'),
    icon: 'i-solar:code-bold-duotone',
    to: '/settings/system/developer',
  },
  {
    title: t('settings.pages.system.experimental.title'),
    description: t('settings.pages.system.experimental.description'),
    icon: 'i-solar:test-tube-bold-duotone',
    to: '/settings/system/experimental',
  },
])
</script>

<template>
  <div :class="['flex flex-col gap-4', 'font-normal']">
    <div />
    <div :class="['flex flex-col gap-4']">
      <RippleGrid
        :items="settings"
        :get-key="item => item.to"
        :columns="1"
        :origin-index="lastClickedIndex"
        @item-click="({ globalIndex }) => setLastClickedIndex(globalIndex)"
      >
        <template #item="{ item }">
          <IconItem
            :title="item.title"
            :description="item.description"
            :icon="item.icon"
            :to="item.to"
          />
        </template>
      </RippleGrid>
    </div>
    <div
      v-motion
      :class="['text-neutral-200/50 dark:text-neutral-600/20', 'pointer-events-none fixed top-[calc(100dvh-12rem)] bottom-0 right--10 z--1', 'size-60 flex items-center justify-center']"
      :initial="{ scale: 0.9, opacity: 0, rotate: 180 }"
      :enter="{ scale: 1, opacity: 1, rotate: 0 }"
      :duration="500"
    >
      <div v-motion :class="['text-60', 'i-solar:settings-bold-duotone']" />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.system.description
  icon: i-solar:filters-bold-duotone
  settingsEntry: true
  order: 9
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
