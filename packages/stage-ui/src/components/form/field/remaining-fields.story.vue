<script setup lang="ts">
import { FieldButton, FieldTextArea, FieldValues } from '@proj-airi/ui'
import { ref, shallowRef } from 'vue'

const text = shallowRef('Describe your character.')
const values = ref(['English', 'Chinese'])
const clicks = shallowRef(0)
</script>

<template>
  <Story title="Additional Fields" group="form">
    <Variant id="button" title="Action, loading, and disabled">
      <div :class="['flex flex-col gap-4 p-4']">
        <FieldButton label="Model cache" description="Remove downloaded models." button-label="Clear cache" @click="clicks++" />
        <p>Clicks: {{ clicks }}</p>
        <FieldButton label="Download" button-label="Downloading" loading />
        <FieldButton label="Unavailable" button-label="Clear cache" disabled />
      </div>
    </Variant>
    <Variant id="text-area" title="Multiline field">
      <div :class="['p-4']">
        <FieldTextArea v-model="text" label="Character description" description="Enter a short description." :required="false" :rows="3" />
        <p>Value: {{ text }}</p>
      </div>
    </Variant>
    <Variant id="values" title="Add, edit, and remove values">
      <div :class="['p-4']">
        <FieldValues v-model="values" label="Languages" description="Add the supported languages." value-placeholder="Language" :required="false" />
        <p>Values: {{ values }}</p>
      </div>
    </Variant>
  </Story>
</template>
