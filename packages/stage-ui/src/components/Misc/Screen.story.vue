<script setup lang="ts">
import Screen from './Screen.vue'
</script>

<template>
  <Story
    title="Screen"
    group="misc"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <Variant id="default" title="Default">
      <div p="2">
        <div w="100" h="100" outline="offset-1 1 red solid">
          <Screen v-slot="{ width, height }">
            {{ `Screen size: ${width}x${height}` }}
          </Screen>
        </div>
      </div>
    </Variant>
  </Story>
</template>
