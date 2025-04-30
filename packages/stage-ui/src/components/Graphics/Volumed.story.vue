<script setup lang="ts">
import Volumed from './Volumed.vue'
</script>

<template>
  <Story
    title="Volumed"
    group="graphics"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="basic"
      title="Basic 3D"
    >
      <div class="h-40 flex items-center justify-center">
        <Volumed :perspective="800">
          <div class="h-20 w-20 bg-primary-500/20" />
        </Volumed>
      </div>
    </Variant>

    <Variant
      id="rotated"
      title="Rotated"
    >
      <div class="h-40 flex items-center justify-center">
        <Volumed
          :perspective="800"
          transform="rotateX(45deg) rotateY(45deg)"
        >
          <div class="h-20 w-20 bg-primary-500/20" />
        </Volumed>
      </div>
    </Variant>

    <Variant
      id="nested"
      title="Nested 3D"
    >
      <div class="h-40 flex items-center justify-center">
        <Volumed :perspective="800">
          <Volumed transform="rotateX(45deg)">
            <div class="h-20 w-20 bg-primary-500/20" />
          </Volumed>
        </Volumed>
      </div>
    </Variant>
  </Story>
</template>
