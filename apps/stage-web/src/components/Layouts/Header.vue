<script setup lang="ts">
import HeaderAvatar from './HeaderAvatar.vue'
import HeaderLink from './HeaderLink.vue'
import ActionAbout from './InteractiveArea/Actions/About.vue'
</script>

<template>
  <header mb-1 w-full flex items-center justify-between gap-2>
    <HeaderLink />
    <div flex items-center gap-2>
      <ActionAbout />
      <HeaderAvatar />
    </div>
  </header>
</template>
