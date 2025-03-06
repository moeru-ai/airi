<script setup lang="ts">
import { definePage } from 'unplugin-vue-router/runtime'

import Buttons from '../components/Buttons.vue'

definePage({
  meta: {
    stageTransition: {
      name: 'fantasy-fall',
      direction: 'down',
    },
  },
})
</script>

<template>
  <Buttons />
</template>
