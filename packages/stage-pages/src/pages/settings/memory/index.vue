<script setup lang="ts">
import { Callout } from '@proj-airi/stage-ui/components'
</script>

<template>
  <div>
    <Callout
      label="In development, needs your help!"
      theme="orange"
    >
      <div>
        This functionality is still under development. If you have any suggestions or would like to contribute, please reach out to us on our <a underline decoration-dotted href="https://github.com/moeru-ai/airi/issues">GitHub issues page</a>.
        The source code of this page is located at <a underline decoration-dotted href="https://github.com/moeru-ai/airi/tree/main/apps/stage-web/src/pages/settings/memory/index.vue">here</a>.
      </div>
    </Callout>
  </div>
  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 15 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:leaf-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
