<script setup lang="ts">
import { provide } from 'vue'

import { ToasterRootInjectionKey } from './constants'

const emits = defineEmits<{
  (e: 'close', id: string): void
}>()

provide(ToasterRootInjectionKey, {
  close: (id: string) => emits('close', id),
})
</script>

<template>
  <slot />
</template>

<style>
[data-sonner-toast=""] [data-content=""] {
  width: 100%;
}
</style>
