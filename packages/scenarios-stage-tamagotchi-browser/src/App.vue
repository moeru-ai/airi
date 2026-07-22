<script setup lang="ts">
import { ScreenNavigator, RouterProvider as ScreenRouterProvider } from '@vishot/mockup-desktop-vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const sceneNavigatorEnabled = computed(() => route.meta.sceneNavigator !== false)
</script>

<template>
  <ScreenRouterProvider>
    <RouterView />
    <ScreenNavigator v-if="sceneNavigatorEnabled" />
  </ScreenRouterProvider>
</template>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
}

#app {
  overflow: hidden;
}
</style>
