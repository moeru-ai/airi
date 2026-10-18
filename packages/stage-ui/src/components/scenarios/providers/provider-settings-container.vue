<script setup lang="ts">
defineProps<{
  disabled?: boolean
}>()
</script>

<template>
  <fieldset :disabled="disabled" bg="neutral-50 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-6" class="m-0 min-w-0 border-0">
    <slot />
  </fieldset>
</template>
