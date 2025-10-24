<script setup lang="ts">
import { commands } from '../../bindings/tauri-plugins/window-router-link'
import { useRouter } from 'vue-router'

const props = defineProps<{
  to: string
  label?: string
}>()

const router = useRouter()

async function handleClick() {
  try {
    // Try using Tauri navigation first (for desktop builds)
    await commands.go(props.to, props.label ?? null)
  } catch (error) {
    // Fallback for web/dev builds where Tauri isn't available
    if (props.to.startsWith('/')) {
      router.push(props.to)
    } else {
      window.open(props.to, '_blank')
    }
  }
}
</script>

<template>
  <a
    :href="to"
    cursor-pointer
    @click.prevent="handleClick"
  >
    <slot />
  </a>
</template>
