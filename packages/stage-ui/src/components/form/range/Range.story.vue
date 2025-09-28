<script setup lang="ts">
import { Range } from '@proj-airi/ui'
import { ref } from 'vue'

const minValue = ref(0)
const midValue = ref(50)
const maxValue = ref(100)
</script>

<template>
  <Story title="Range" group="form" :layout="{ type: 'grid', width: '100%' }">
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default-min" title="Default (min)">
      <Range v-model="minValue" w-full />
    </Variant>

    <Variant id="default-mid" title="Default (mid)">
      <Range v-model="midValue" w-full />
    </Variant>

    <Variant id="default-max" title="Default (max)">
      <Range v-model="maxValue" w-full />
    </Variant>
  </Story>
</template>
