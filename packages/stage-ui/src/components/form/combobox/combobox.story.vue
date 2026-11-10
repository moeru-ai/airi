<script setup lang="ts">
import { Combobox } from '@proj-airi/ui'
import { shallowRef } from 'vue'

const selected = shallowRef('local')
const options = [
  { groupLabel: 'Available', children: [
    { label: 'Local model', value: 'local', description: 'Runs on this device.' },
    { label: 'Cloud model', value: 'cloud', icon: 'i-solar:cloud-linear' },
    { label: 'Unavailable model', value: 'unavailable', disabled: true },
  ] },
]
</script>

<template>
  <Story title="Combobox" group="form">
    <Variant id="search" title="Search and grouped options">
      <div :class="['max-w-sm p-4']">
        <Combobox v-model="selected" :options="options" placeholder="Choose a model" aria-label="Model">
          <template #empty>
            No matching models.
          </template>
        </Combobox>
        <p>Selected: {{ selected }}</p>
      </div>
    </Variant>
    <Variant id="disabled" title="Disabled">
      <Combobox v-model="selected" :options="options" disabled :class="['max-w-sm m-4']" aria-label="Disabled model" />
    </Variant>
    <Variant id="empty" title="Empty catalog">
      <Combobox :options="[]" placeholder="No models" :class="['max-w-sm m-4']" aria-label="Empty model catalog">
        <template #empty>
          No models are available.
        </template>
      </Combobox>
    </Variant>
  </Story>
</template>
