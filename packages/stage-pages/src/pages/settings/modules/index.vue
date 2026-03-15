<script setup lang="ts">
import { IconStatusItem, RippleGrid } from '@proj-airi/stage-ui/components'
import { useModulesList } from '@proj-airi/stage-ui/composables/use-modules-list'
import { useRippleGridState } from '@proj-airi/stage-ui/composables/use-ripple-grid-state'

const { modulesList } = useModulesList()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState()
</script>

<template>
  <div>
    <RippleGrid
      :items="modulesList"
      :columns="{ default: 1, sm: 2 }"
      :origin-index="lastClickedIndex"
      @item-click="({ globalIndex }) => setLastClickedIndex(globalIndex)"
    >
      <template #item="{ item: module }">
        <IconStatusItem
          :title="module.name"
          :description="module.description"
          :icon="module.icon"
          :icon-color="module.iconColor"
          :icon-image="module.iconImage"
          :to="module.to"
          :configured="module.configured"
        />
      </template>
    </RippleGrid>
  </div>
  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 20 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:layers-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.modules.description
  icon: i-solar:layers-bold-duotone
  settingsEntry: true
  order: 2
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
