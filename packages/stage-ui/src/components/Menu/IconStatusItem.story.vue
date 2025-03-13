<script setup lang="ts">
import ThemeColorsHueControl from '../../../stories/ThemeColorsHueControl.vue'
import IconStatusItem from './IconStatusItem.vue'
</script>

<template>
  <Story
    title="Menu Icon Item (with Status)"
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

    <Variant
      id="global-configured"
      title="IconItem"
    >
      <IconStatusItem
        title="Title"
        description="Description"
        icon=" i-lucide:ghost"
        to="/"
        :configured="true"
      />
    </Variant>

    <Variant
      id="global-hover"
      title="IconItem"
    >
      <IconStatusItem
        title="Title"
        description="Description"
        icon=" i-lucide:ghost"
        to="/"
        :configured="false"
        class="_hover"
      />
    </Variant>

    <Variant
      id="global-hover-configured"
      title="IconItem"
    >
      <IconStatusItem
        title="Title"
        description="Description"
        icon=" i-lucide:ghost"
        to="/"
        :configured="true"
        class="_hover"
      />
    </Variant>
  </Story>
</template>
