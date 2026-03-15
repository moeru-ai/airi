<script setup lang="ts">
import { FieldCheckbox } from '@proj-airi/ui'
import { ref } from 'vue'

const checkedValue = ref(true)
const uncheckedValue = ref(false)
</script>

<template>
  <Story
    title="Field Checkbox"
    group="form"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="checked"
      title="Checked"
    >
      <div>
        <FieldCheckbox
          v-model="checkedValue"
          label="Speaker Boost"
          description="Enhance speaker similarity"
        />
      </div>
    </Variant>

    <Variant
      id="unchecked"
      title="Unchecked"
    >
      <div>
        <FieldCheckbox
          v-model="uncheckedValue"
          label="Use High Quality"
          description="Use higher quality but slower processing"
        />
      </div>
    </Variant>

    <Variant
      id="interactive"
      title="Interactive"
    >
      <div>
        <FieldCheckbox
          v-model="checkedValue"
          label="Toggle Me"
          description="This checkbox can be toggled"
        />
        <div class="mt-4 text-sm">
          Current value: {{ checkedValue ? 'On' : 'Off' }}
        </div>
      </div>
    </Variant>
  </Story>
</template>
