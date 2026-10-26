<script setup lang="ts">
import { shallowRef } from 'vue'

import SettingsSearchField from './settings-search-field.vue'

const query = shallowRef('model')
</script>

<template>
  <Story title="Settings Search Field" group="misc">
    <Variant id="default" title="With a query">
      <div :class="['flex flex-col gap-4 p-4']">
        <SettingsSearchField v-model="query" />
        <p>Query: {{ query }}. Press Cmd+F or Ctrl+F anywhere to focus the field.</p>
      </div>
    </Variant>
  </Story>
</template>
