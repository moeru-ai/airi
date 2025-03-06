<script setup lang="ts">
import { definePage } from 'unplugin-vue-router/runtime'

import Buttons from '../components/Buttons.vue'

definePage({
  meta: {
    stageTransition: {
      name: 'slope-slide',
    },
  },
})
</script>

<template>
  <Buttons />
</template>
