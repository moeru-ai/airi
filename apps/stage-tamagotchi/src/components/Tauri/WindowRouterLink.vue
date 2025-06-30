<script setup lang="ts">
import { useTauriCore } from '../../composables/tauri'

const props = defineProps<{
  to: string
  label?: string
}>()

const { invoke } = useTauriCore()

function handleClick() {
  invoke('plugin:proj-airi-tauri-plugin-window-router-link|go', {
    route: props.to,
    windowLabel: props.label,
  })
}
</script>

<template>
  <a cursor-pointer @click="handleClick">
    <slot />
  </a>
</template>
