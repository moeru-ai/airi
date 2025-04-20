<script setup lang="ts">
import { ref } from 'vue'

import Textarea from './Textarea.vue'

const input = ref('')
</script>

<template>
  <Story
    title="Textarea"
    group="form"
    :layout="{ type: 'grid', width: 400 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default">
      <Textarea v-model="input" />
    </Variant>
  </Story>
</template>
