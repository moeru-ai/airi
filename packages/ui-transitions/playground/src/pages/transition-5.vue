<script setup lang="ts">
import { definePage } from 'vue-router/experimental'

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
