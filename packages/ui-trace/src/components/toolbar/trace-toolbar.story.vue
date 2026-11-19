<script setup lang="ts">
import { ref } from 'vue'

import TraceToolbar from './trace-toolbar.vue'

const recording = ref(true)
const following = ref(true)
const hasCursor = ref(true)
</script>

<template>
  <Story title="Trace toolbar" group="devtools" :layout="{ type: 'single', iframe: false }">
    <Variant id="recording" title="Recording">
      <div :class="['p-4']">
        <div :class="['rounded-md border border-neutral-200 dark:border-neutral-800']">
          <TraceToolbar
            :recording="recording"
            :following="following && recording"
            :has-cursor="hasCursor"
            @toggle-recording="recording = !recording"
            @toggle-follow="following = !following"
            @clear-cursor="hasCursor = false"
          />
        </div>
      </div>
    </Variant>

    <Variant id="paused" title="Paused">
      <div :class="['p-4']">
        <div :class="['rounded-md border border-neutral-200 dark:border-neutral-800']">
          <TraceToolbar :recording="false" :following="false" :has-cursor="false" />
        </div>
      </div>
    </Variant>
  </Story>
</template>
