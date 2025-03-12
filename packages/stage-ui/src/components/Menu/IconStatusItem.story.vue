<script setup lang="ts">
import ThemeColorsHueControl from '../../../stories/ThemeColorsHueControl.vue'
import IconStatusItem from './IconStatusItem.vue'
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
      <IconStatusItem
        title="Title"
        description="Description"
        icon=" i-lucide:ghost"
        to="/"
        :configured="false"
      />
    </Variant>
  </Story>
</template>
