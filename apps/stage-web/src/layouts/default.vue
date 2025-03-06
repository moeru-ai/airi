<script setup lang="ts">
import { RouterView } from 'vue-router'

import HeaderLink from '../components/Layouts/HeaderLink.vue'
</script>

<template>
  <div p-2>
    <div mb-1 w-full gap-2 p-2>
      <HeaderLink />
    </div>
    <div p-5 flex="~ col gap-4">
      <RouterView />
    </div>
  </div>
</template>
