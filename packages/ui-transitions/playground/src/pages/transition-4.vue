<script setup lang="ts">
import { definePage } from 'vue-router/experimental'

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
