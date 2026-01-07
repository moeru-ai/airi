<script setup lang="ts">
import { RoundRange } from '@proj-airi/ui'
import { ref } from 'vue'

const minValue = ref(0)
const midValue = ref(50)
const maxValue = ref(100)
</script>

<template>
  <Story title="Round Range" group="form" :layout="{ type: 'grid', width: '100%' }">
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default-min" title="Default (min)">
      <RoundRange v-model="minValue" w-full />
    </Variant>

    <Variant id="default-mid" title="Default (mid)">
      <RoundRange v-model="midValue" w-full />
    </Variant>

    <Variant id="default-max" title="Default (max)">
      <RoundRange v-model="maxValue" w-full />
    </Variant>
  </Story>
</template>
