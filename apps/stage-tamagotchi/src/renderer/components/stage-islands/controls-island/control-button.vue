<script setup lang="ts">
import { useBackdropSurface } from '@proj-airi/stage-ui/composables/backdrop-surface'
import { OverlayButton } from '@proj-airi/ui'
import { computed, useTemplateRef } from 'vue'

const props = defineProps<{ buttonStyle?: string }>()

const button = useTemplateRef<InstanceType<typeof OverlayButton>>('button')
// The button floats over the stage, and the desktop shows through the transparent window around the character.
useBackdropSurface(computed(() => button.value?.$el as HTMLElement | undefined))
</script>

<template>
  <OverlayButton
    ref="button"
    size="sm"
    :class="[
      'p-2!',
      props.buttonStyle,
    ]"
  >
    <slot />
  </OverlayButton>
</template>
