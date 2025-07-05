<script setup lang="ts">
import { WindowRouterLink } from '../../commands'

const props = defineProps<{
  to: string
  label?: string
}>()

function handleClick() {
  WindowRouterLink.commands.go(props.to, props.label ?? null)
}
</script>

<template>
  <a cursor-pointer @click="handleClick">
    <slot />
  </a>
</template>
