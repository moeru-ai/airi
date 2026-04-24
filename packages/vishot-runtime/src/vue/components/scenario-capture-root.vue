<script setup lang="ts">
import type { ScenarioCaptureRootProps } from '../../runtime/types'

const props = withDefaults(defineProps<ScenarioCaptureRootProps>(), {
  padding: '0px',
})
</script>

<template>
  <section
    :data-scenario-capture-root="props.name"
    :style="{ padding: props.padding }"
    :class="[
      'relative box-border flex flex-col',
    ]"
  >
    <slot />
  </section>
</template>
