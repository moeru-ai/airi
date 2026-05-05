<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { Callout } from '@proj-airi/ui'
import { computed } from 'vue'

const props = defineProps<{
  runtimeSnapshot: ModelSettingsRuntimeSnapshot
}>()

const statusText = computed(() => {
  if (props.runtimeSnapshot.phase === 'no-model')
    return 'Select Model continues to update the active scene input. Godot-specific stage controls will land here later.'

  return 'Model selection stays active while the embedded scene renderer is paused. Godot-specific stage controls will land here later.'
})
</script>

<template>
  <Callout label="Godot Stage (Experimental)">
    <p>{{ statusText }}</p>
  </Callout>
</template>
