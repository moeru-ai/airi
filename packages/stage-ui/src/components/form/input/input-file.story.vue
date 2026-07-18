<script setup lang="ts">
import { InputFile } from '@proj-airi/ui'
import { ref } from 'vue'

const files = ref<File[] | undefined>(undefined)
</script>

<template>
  <Story
    title="Input File"
    group="form"
    :layout="{ type: 'grid', width: 360 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default" title="Default">
      <InputFile
        v-model="files"
        accept="image/*,video/*"
      />

      <div class="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        Selected: {{ files?.length ?? 0 }} file(s)
      </div>
    </Variant>
  </Story>
</template>
