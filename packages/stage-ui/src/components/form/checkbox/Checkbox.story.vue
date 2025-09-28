<script setup lang="ts">
import { Checkbox } from '@proj-airi/ui'
import { ref } from 'vue'

const checkedValue = ref(true)
const uncheckedValue = ref(false)
const interactiveValue = ref(false)
</script>

<template>
  <Story
    title="Checkbox"
    group="form"
    :layout="{ type: 'grid', width: 300 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="checked"
      title="Checked"
    >
      <div>
        <Checkbox v-model="checkedValue" />
      </div>
    </Variant>

    <Variant
      id="unchecked"
      title="Unchecked"
    >
      <div>
        <Checkbox v-model="uncheckedValue" />
      </div>
    </Variant>

    <Variant
      id="interactive"
      title="Interactive"
    >
      <div>
        <div class="flex items-center gap-4">
          <Checkbox v-model="interactiveValue" />
          <div class="text-sm">
            Current value: {{ interactiveValue ? 'On' : 'Off' }}
          </div>
        </div>
      </div>
    </Variant>

    <Variant
      id="sizes"
      title="Different Contexts"
    >
      <div>
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-2">
            <Checkbox v-model="checkedValue" />
            <span class="text-sm">Default checkbox in a row</span>
          </div>

          <div class="flex items-center gap-2 bg-neutral-100 p-3 dark:bg-neutral-800">
            <Checkbox v-model="checkedValue" />
            <span class="text-sm">Checkbox in a different background</span>
          </div>
        </div>
      </div>
    </Variant>
  </Story>
</template>
