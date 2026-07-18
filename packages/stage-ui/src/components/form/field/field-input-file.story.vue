<script setup lang="ts">
import { FieldInputFile } from '@proj-airi/ui'
import { ref } from 'vue'

const files = ref<File[] | undefined>(undefined)
</script>

<template>
  <Story
    title="Field Input File"
    group="form"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="default"
      title="Default"
    >
      <FieldInputFile
        v-model="files"
        label="Upload screenshot or video"
        description="Optionally attach files from your photo library."
        accept="image/*,video/*"
        multiple
        placeholder="Choose screenshot or video file"
      />
      <div class="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        Selected: {{ files?.length ?? 0 }} file(s)
      </div>
    </Variant>
  </Story>
</template>
