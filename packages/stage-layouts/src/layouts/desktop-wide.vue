<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div
    :style="{
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
    }"
    :class="[
      'h-full w-full',
      'flex flex-col',
    ]"
  >
    <div
      :class="[
        'h-[64px]',
        'drag-region',
      ]"
    />
    <div
      :class="[
        'overflow-y-auto',
      ]"
    >
      <!-- Content -->
      <RouterView />
    </div>
  </div>
</template>
