<script setup lang="ts">
import ThemeColorsHueControl from '../../../stories/ThemeColorsHueControl.vue'
import IconItem from './IconItem.vue'
</script>

<template>
  <Story
    :layout="{ type: 'grid', width: 500 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="global"
      title="IconItem"
    >
      <IconItem title="Modules" description="Thinking, vision, speech synthesis, gaming, etc." icon="i-lucide:blocks" to="/settings/modules" />
    </Variant>
  </Story>
</template>
