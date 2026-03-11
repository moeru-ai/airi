<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { computed } from 'vue'

interface Props {
  isCapturing?: boolean
  cooldownRemaining?: number
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isCapturing: false,
  cooldownRemaining: 0,
  disabled: false,
})

const emit = defineEmits<{
  capture: []
}>()

const isDisabled = computed(() => props.disabled || props.isCapturing || props.cooldownRemaining > 0)

const buttonLabel = computed(() => {
  if (props.isCapturing)
    return 'Capturing...'
  if (props.cooldownRemaining > 0)
    return `Wait ${Math.ceil(props.cooldownRemaining / 1000)}s`
  return 'Let AIRI see'
})
</script>

<template>
  <Button
    :label="buttonLabel"
    :loading="isCapturing"
    :disabled="isDisabled"
    variant="ghost"
    size="sm"
    @click="emit('capture')"
  />
</template>
