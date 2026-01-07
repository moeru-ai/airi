<script setup lang="ts">
import { ref } from 'vue'

import PropertyNumber from './PropertyNumber.vue'

const minValue = ref(0)
const midValue = ref(50)
const maxValue = ref(100)
</script>

<template>
  <Story title="Range" group="data-pane" :layout="{ type: 'grid', width: 500 }">
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default-min" title="Default (min)">
      <PropertyNumber v-model="minValue" w-full />
    </Variant>

    <Variant id="default-mid" title="Default (mid)">
      <PropertyNumber v-model="midValue" w-full />
    </Variant>

    <Variant id="default-max" title="Default (max)">
      <PropertyNumber v-model="maxValue" w-full />
    </Variant>
  </Story>
</template>
