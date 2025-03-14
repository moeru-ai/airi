<script setup lang="ts">
import { ref } from 'vue'

import RadioCardSimple from './RadioCardSimple.vue'

const modelValue = ref('test')
</script>

<template>
  <Story
    title="Radio Card (simple)"
    group="form"
    :layout="{ type: 'grid', width: 500 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default" title="Default">
      <RadioCardSimple
        id="test"
        name="radio-card-simple"
        value="non-selected"
        title="Test"
        description="Test description"
        :model-value="modelValue"
      />
    </Variant>

    <Variant id="hover" title="Hover">
      <RadioCardSimple
        id="test"
        name="radio-card-simple"
        value="non-selected"
        title="Test"
        description="Test description"
        :model-value="modelValue"
        class="_hover"
      />
    </Variant>

    <Variant id="default-selected" title="Default Selected">
      <RadioCardSimple
        id="test"
        name="radio-card-simple"
        value="test"
        title="Test"
        description="Test description"
        :model-value="modelValue"
      />
    </Variant>

    <Variant id="hover-selected" title="Hover Selected">
      <RadioCardSimple
        id="test"
        name="radio-card-simple"
        value="test"
        title="Test"
        description="Test description"
        :model-value="modelValue"
        class="_hover"
      />
    </Variant>
  </Story>
</template>
