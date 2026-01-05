<script setup lang="ts">
import HeaderAvatar from './HeaderAvatar.vue'
import MobileHeaderLink from './MobileHeaderLink.vue'
</script>

<template>
  <header mb-1 w-full flex items-center justify-between gap-2 px-2>
    <MobileHeaderLink />
    <HeaderAvatar />
  </header>
</template>
