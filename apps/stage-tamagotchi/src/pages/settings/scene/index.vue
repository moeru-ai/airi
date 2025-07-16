<script setup lang="ts">
import IconAnimation from '../../../components/IconAnimation.vue'

import { useIconAnimation } from '../../../composables/icon-animation'

const {
  iconAnimationStarted,
  showIconAnimation,
  animationIcon,
} = useIconAnimation('i-solar:armchair-2-bold-duotone')
</script>

<template>
  <div>
    <Callout
      label="In development, needs your help!"
      theme="orange"
    >
      <div>
        This functionality is still under development. If you have any suggestions or would like to contribute, please reach out to us on our <a underline decoration-dotted href="https://github.com/moeru-ai/airi/issues">GitHub issues page</a>.
        The source code of this page is located at <a underline decoration-dotted href="https://github.com/moeru-ai/airi/tree/main/apps/stage-tamagotchi/src/pages/settings/scene/index.vue">here</a>.
      </div>
    </Callout>
  </div>
  <IconAnimation
    v-if="showIconAnimation"
    :z-index="-1"
    :icon="animationIcon"
    :icon-size="12"
    :duration="1000"
    :started="iconAnimationStarted"
    :is-reverse="true"
    position="calc(100dvw - 9.5rem), calc(100dvh - 9.5rem)"
    text-color="text-neutral-200/50 dark:text-neutral-600/20"
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
    <div text="60" i-solar:armchair-2-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
