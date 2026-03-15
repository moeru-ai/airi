<script setup lang="ts">
import { definePage } from 'unplugin-vue-router/runtime'

import Buttons from '../components/Buttons.vue'

definePage({
  meta: {
    stageTransition: {
      name: 'multiple-blocks-reveal',
    },
  },
})
</script>

<template>
  <Buttons />
</template>
