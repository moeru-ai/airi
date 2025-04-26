<script setup lang="ts">
import { ref } from 'vue'

import InputFile from './InputFile.vue'

const files = ref<File[]>([])
</script>

<template>
  <Story
    title="Input File"
    group="form"
    :layout="{ type: 'grid', width: 600 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default" title="Default">
      <InputFile v-model="files" />

      <div p-2>
        <div>
          File List
        </div>
        <ul>
          <li v-for="file in files" :key="file.name">
            <p>
              {{ file.name }}, {{ file.size }} bytes, {{ file.type }}
            </p>
          </li>
        </ul>
      </div>
    </Variant>
  </Story>
</template>
