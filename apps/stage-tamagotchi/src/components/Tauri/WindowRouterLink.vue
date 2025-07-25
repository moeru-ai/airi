<script setup lang="ts">
import { commands } from '../../bindings/tauri-plugins/window-router-link'

const props = defineProps<{
  to: string
  label?: string
}>()

function handleClick() {
  commands.go(props.to, props.label ?? null)
}
</script>

<template>
  <a cursor-pointer @click="handleClick">
    <slot />
  </a>
</template>
