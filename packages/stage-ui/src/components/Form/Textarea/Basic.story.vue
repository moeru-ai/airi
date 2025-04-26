<script setup lang="ts">
import { BasicTextarea } from '@proj-airi/ui'
</script>

<template>
  <Story
    title="Textarea (basic)"
    group="form"
    :layout="{ type: 'grid', width: 400 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default">
      <BasicTextarea />
    </Variant>
  </Story>
</template>
