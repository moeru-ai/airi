<script setup lang="ts">
import { FieldRange } from '@proj-airi/ui'
import { ref } from 'vue'

const minValue = ref(0)
const midValue = ref(0.5)
const maxValue = ref(1)
const customValue = ref(75)

function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`
}
</script>

<template>
  <Story
    title="Field Range"
    group="form"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="default-min"
      title="Default (min)"
    >
      <div>
        <FieldRange
          v-model="minValue"
          label="Minimum Value"
          description="Slider at minimum value"
        />
      </div>
    </Variant>

    <Variant
      id="default-mid"
      title="Default (mid)"
    >
      <div>
        <FieldRange
          v-model="midValue"
          label="Medium Value"
          description="Slider at medium value"
        />
      </div>
    </Variant>

    <Variant
      id="default-max"
      title="Default (max)"
    >
      <div>
        <FieldRange
          v-model="maxValue"
          label="Maximum Value"
          description="Slider at maximum value"
        />
      </div>
    </Variant>

    <Variant
      id="custom-range"
      title="Custom Range"
    >
      <div>
        <FieldRange
          v-model="customValue"
          label="Custom Range"
          description="Slider with custom min, max, and step values"
          :min="0"
          :max="100"
          :step="5"
        />
      </div>
    </Variant>

    <Variant
      id="formatted-value"
      title="Formatted Value"
    >
      <div>
        <FieldRange
          v-model="midValue"
          label="Formatted Value"
          description="Slider with custom value formatting"
          :format-value="formatPercentage"
        />
      </div>
    </Variant>
  </Story>
</template>
