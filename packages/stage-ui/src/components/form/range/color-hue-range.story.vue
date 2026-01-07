<script setup lang="ts">
import { ColorHueRange } from '@proj-airi/ui'
import { ref } from 'vue'

const minValue = ref(0)
const midValue = ref(50)
const maxValue = ref(100)
</script>

<template>
  <Story title="Color Hue Range" group="form" :layout="{ type: 'grid', width: '100%' }">
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default-min" title="Default (min)">
      <div p-4>
        <ColorHueRange v-model="minValue" w-full />
      </div>
    </Variant>

    <Variant id="default-mid" title="Default (mid)">
      <div p-4>
        <ColorHueRange v-model="midValue" w-full />
      </div>
    </Variant>

    <Variant id="default-max" title="Default (max)">
      <div p-4>
        <ColorHueRange v-model="maxValue" w-full />
      </div>
    </Variant>
  </Story>
</template>
