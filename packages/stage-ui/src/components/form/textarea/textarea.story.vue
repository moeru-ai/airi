<script setup lang="ts">
import { Textarea } from '@proj-airi/ui'
import { ref } from 'vue'

const input = ref('')
</script>

<template>
  <Story
    title="Textarea"
    group="form"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default" title="Default">
      <Textarea v-model="input" />
    </Variant>
  </Story>
</template>
