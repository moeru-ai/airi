<script setup lang="ts">
import { ComboboxSelect } from '@proj-airi/ui'
import { ref } from 'vue'

const singleValue = ref('option1')
const disabledValue = ref('option2')

const options = [
  { label: 'Option 1', value: 'option1' },
  { label: 'Option 2', value: 'option2' },
  { label: 'Option 3', value: 'option3' },
  { label: 'Option 4', value: 'option4' },
]
</script>

<template>
  <Story
    title="Combobox Select"
    group="form"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="basic"
      title="Basic Combobox Select"
    >
      <div>
        <ComboboxSelect
          v-model="singleValue"
          :options="options"
          placeholder="Choose an option..."
        />
      </div>
    </Variant>

    <Variant
      id="disabled"
      title="Disabled Combobox Select"
    >
      <div>
        <ComboboxSelect
          v-model="disabledValue"
          :options="options"
          placeholder="Disabled select"
          disabled
        />
      </div>
    </Variant>

    <Variant
      id="custom-width"
      title="Custom Width"
    >
      <div class="w-[300px]">
        <ComboboxSelect
          v-model="singleValue"
          :options="options"
          placeholder="Choose an option..."
        />
      </div>
    </Variant>
  </Story>
</template>
