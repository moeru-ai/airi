<script setup lang="ts">
import { InputKeyValue } from '@proj-airi/ui'
import { ref } from 'vue'

const key = ref('')
const value = ref('')
</script>

<template>
  <Story
    title="Input Key Value"
    group="form"
    :layout="{ type: 'grid', width: 300 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <InputKeyValue
      v-model:property-key="key"
      v-model:property-value="value"
      key-placeholder="Key"
      value-placeholder="Value"
    />
  </Story>
</template>
