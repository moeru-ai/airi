<script setup lang="ts">
import HeroCardDemo from './HeroCardDemo.vue'
</script>

<template>
  <Story
    title="Hero Card Demo"
    group="menu"
    :layout="{ type: 'grid', width: 500 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <div p-20>
      <Variant
        id="global"
        title="HeroCardDemo"
      >
        <HeroCardDemo />
      </Variant>
    </div>
  </Story>
</template>
