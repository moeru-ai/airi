<script setup lang="ts">
import Alert from './Alert.vue'

defineProps<{
  title?: string
  error?: any
}>()
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
