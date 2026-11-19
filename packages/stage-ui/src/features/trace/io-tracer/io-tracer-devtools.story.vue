<script setup lang="ts">
import type { App } from 'vue'

import { storyTraceFeed } from '@proj-airi/ui-trace/stories'
import { createPinia } from 'pinia'

import IOTracerDevtools from './io-tracer-devtools.vue'

import { setTraceFeedSource } from '../../../composables/use-trace'

/** The store reads the voice turn fixture from a feed, like it reads a live collector. */
function setupApp({ app }: { app: App }) {
  setTraceFeedSource(storyTraceFeed())
  app.use(createPinia())
}
</script>

<template>
  <Story title="IO tracer" group="devtools" :layout="{ type: 'single', iframe: true }" :setup-app="setupApp">
    <Variant id="workbench" title="Workbench">
      <div :class="['h-screen']">
        <IOTracerDevtools />
      </div>
    </Variant>
  </Story>
</template>
