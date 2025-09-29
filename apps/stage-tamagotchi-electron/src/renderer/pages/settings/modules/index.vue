<script setup lang="ts">
import { IconStatusItem } from '@proj-airi/stage-ui/components'
import { useModulesList } from '@proj-airi/stage-ui/composables/useModulesList'

import IconAnimation from '../../../components/IconAnimation.vue'

import { useIconAnimation } from '../../../composables/icon-animation'

const { modulesList } = useModulesList()

const {
  iconAnimationStarted,
  showIconAnimation,
  animationIcon,
} = useIconAnimation('i-solar:layers-bold-duotone')
</script>

<template>
  <div grid="~ cols-1 sm:cols-2 gap-4">
    <IconStatusItem
      v-for="(module, index) of modulesList"
      :key="module.id"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + index * 10"
      :delay="index * 50"
      :title="module.name"
      :description="module.description"
      :icon="module.icon"
      :icon-color="module.iconColor"
      :icon-image="module.iconImage"
      :to="module.to"
      :configured="module.configured"
    />
  </div>
  <IconAnimation
    v-if="showIconAnimation"
    :icon="animationIcon"
    :icon-size="12"
    :duration="1000"
    :started="iconAnimationStarted"
    :is-reverse="true"
    :z-index="-1"
    text-color="text-neutral-200/50 dark:text-neutral-600/20"
    position="calc(100dvw - 9.5rem), calc(100dvh - 9.5rem)"
  />
  <div
    v-else
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
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
