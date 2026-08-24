<script setup lang="ts">
import { OverlayButton } from '@proj-airi/ui'

const props = defineProps<{ buttonStyle?: string }>()
</script>

<template>
  <OverlayButton
    size="sm"
    :class="[
      'p-2!',
      props.buttonStyle,
    ]"
  >
    <slot />
  </OverlayButton>
</template>
