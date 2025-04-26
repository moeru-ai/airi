<script setup lang="ts">
import { ref } from 'vue'

import RadioCardDetail from './RadioCardDetail.vue'

const modelValue = ref('test')
</script>

<template>
  <Story
    title="Radio Card (detail)"
    group="menu"
    :layout="{ type: 'grid', width: 500 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default" title="Default">
      <RadioCardDetail
        id="test"
        v-model="modelValue"
        value="non-selected"
        title="Test"
        description="Test description"
        :deprecated="false"
        :show-expand-collapse="true"
        :expand-collapse-threshold="100"
        :show-custom-input="true"
        custom-input-value="Test input value"
        custom-input-placeholder="Test input placeholder"
        name="radio-card-detail-many-select"
        class="scroll-snap-align-start"
      />
    </Variant>

    <Variant id="hover" title="Hover">
      <RadioCardDetail
        id="test"
        v-model="modelValue"
        value="non-selected"
        title="Test"
        description="Test description"
        :deprecated="false"
        :show-expand-collapse="true"
        :expand-collapse-threshold="100"
        :show-custom-input="true"
        custom-input-value="Test input value"
        custom-input-placeholder="Test input placeholder"
        name="radio-card-detail-many-select"
        class="scroll-snap-align-start _hover"
      />
    </Variant>

    <Variant id="default-long-description" title="Long description">
      <RadioCardDetail
        id="test"
        v-model="modelValue"
        value="non-selected"
        title="Test"
        :description="'Test description'.repeat(10)"
        :deprecated="false"
        :show-expand-collapse="true"
        :expand-collapse-threshold="100"
        :show-custom-input="true"
        custom-input-value="Test input value"
        custom-input-placeholder="Test input placeholder"
        name="radio-card-detail-many-select"
        class="scroll-snap-align-start"
      />
    </Variant>

    <Variant id="hover-long-description" title="Hover Long description">
      <RadioCardDetail
        id="test"
        v-model="modelValue"
        value="non-selected"
        title="Test"
        :description="'Test description'.repeat(10)"
        :deprecated="false"
        :show-expand-collapse="true"
        :expand-collapse-threshold="100"
        :show-custom-input="true"
        custom-input-value="Test input value"
        custom-input-placeholder="Test input placeholder"
        name="radio-card-detail-many-select"
        class="scroll-snap-align-start _hover"
      />
    </Variant>

    <Variant id="default-selected" title="Default Selected">
      <RadioCardDetail
        id="test"
        v-model="modelValue"
        value="test"
        title="Test"
        description="Test description"
        :deprecated="false"
        :show-expand-collapse="true"
        :expand-collapse-threshold="100"
        :show-custom-input="true"
        custom-input-value="Test input value"
        custom-input-placeholder="Test input placeholder"
        name="radio-card-detail-many-select"
        class="scroll-snap-align-start"
      />
    </Variant>

    <Variant id="hover-selected" title="Hover Selected">
      <RadioCardDetail
        id="test"
        v-model="modelValue"
        value="test"
        title="Test"
        description="Test description"
        :deprecated="false"
        :show-expand-collapse="true"
        :expand-collapse-threshold="100"
        :show-custom-input="true"
        custom-input-value="Test input value"
        custom-input-placeholder="Test input placeholder"
        name="radio-card-detail-many-select"
        class="scroll-snap-align-start _hover"
      />
    </Variant>

    <Variant id="default-selected-long-description" title="Long description Selected">
      <RadioCardDetail
        id="test"
        v-model="modelValue"
        value="test"
        title="Test"
        :description="'Test description'.repeat(10)"
        :deprecated="false"
        :show-expand-collapse="true"
        :expand-collapse-threshold="100"
        :show-custom-input="true"
        custom-input-value="Test input value"
        custom-input-placeholder="Test input placeholder"
        name="radio-card-detail-many-select"
        class="scroll-snap-align-start"
      />
    </Variant>

    <Variant id="hover-selected-long-description" title="Hover Long description Selected">
      <RadioCardDetail
        id="test"
        v-model="modelValue"
        value="test"
        title="Test"
        :description="'Test description'.repeat(10)"
        :deprecated="false"
        :show-expand-collapse="true"
        :expand-collapse-threshold="100"
        :show-custom-input="true"
        custom-input-value="Test input value"
        custom-input-placeholder="Test input placeholder"
        name="radio-card-detail-many-select"
        class="scroll-snap-align-start _hover"
      />
    </Variant>
  </Story>
</template>
