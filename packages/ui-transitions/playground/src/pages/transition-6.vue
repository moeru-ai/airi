<script setup lang="ts">
import { definePage } from 'unplugin-vue-router/runtime'

import Buttons from '../components/Buttons.vue'

definePage({
  meta: {
    stageTransition: 'rectangles-rotate',
  },
})
</script>

<template>
  <Buttons />
</template>
