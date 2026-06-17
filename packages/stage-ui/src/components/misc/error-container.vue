<script setup lang="ts">
import Alert from './alert.vue'

withDefaults(
  defineProps<{
    title?: string
    error?: unknown
  }>(),
  {
    title: '',
    error: undefined,
  },
)
</script>

<template>
  <Alert type="error">
    <template #title>
      {{ title }}
    </template>
    <template v-if="error" #content>
      <pre class="whitespace-pre-wrap break-all">{{ String(error) }}</pre>
    </template>
  </Alert>
</template>
