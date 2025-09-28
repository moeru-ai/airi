<script setup lang="ts">
import IconItem from './IconItem.vue'
</script>

<template>
  <Story
    title="Menu Icon Item"
    group="menu"
    :layout="{ type: 'grid', width: 500 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="global"
      title="IconItem"
    >
      <IconItem
        title="Modules"
        description="Thinking, vision, speech synthesis, gaming, etc."
        icon="i-solar:layers-bold-duotone"
        to="/settings/modules"
        class="font-sans"
      />
    </Variant>

    <Variant
      id="global-hover"
      title="IconItem"
    >
      <IconItem
        title="Modules"
        description="Thinking, vision, speech synthesis, gaming, etc."
        icon="i-solar:layers-bold-duotone"
        to="/settings/modules"
        class="_hover font-sans"
      />
    </Variant>
  </Story>
</template>
