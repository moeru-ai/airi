<script setup lang="ts">
import HeaderFlux from './header-flux.vue'
import HeaderAvatar from './HeaderAvatar.vue'
import HeaderLink from './HeaderLink.vue'
</script>

<template>
  <header mb-1 w-full flex items-center justify-between gap-2>
    <HeaderLink />
    <div flex items-center gap-2>
      <HeaderFlux />
      <HeaderAvatar />
    </div>
  </header>
</template>
