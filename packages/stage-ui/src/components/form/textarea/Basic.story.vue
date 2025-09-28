<script setup lang="ts">
import { BasicTextarea } from '@proj-airi/ui'
</script>

<template>
  <Story
    title="Textarea (basic)"
    group="form"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default" title="Default">
      <div class="rounded-lg bg-neutral-200 p-2 dark:bg-neutral-700">
        <BasicTextarea />
      </div>
    </Variant>
  </Story>
</template>
