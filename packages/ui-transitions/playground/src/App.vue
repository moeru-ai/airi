<script setup>
import { useDark } from '@vueuse/core'

import StageTransitionGroup from '../../src/components/StageTransitionGroup.vue'

const isDark = useDark()
</script>

<template>
  <div class="app-container" h-full p-4>
    <!-- https://paletton.com/#uid=54h1e0kl1++bM++qIEfl0f+Er8y -->
    <StageTransitionGroup
      :primary-color="!isDark ? '#FFA1B3' : '#FF5778'"
      :secondary-color="!isDark ? '#A1FFD7' : '#57FFB7'"
    >
      <router-view v-slot="{ Component, route: r }">
        <component :is="Component" :key="r.path" />
      </router-view>
    </StageTransitionGroup>
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
  overscroll-behavior: none;
}

html {
  background: #fff;
  transition: all 0.3s ease-in-out;
}

html.dark {
  background: #121212;
  color-scheme: dark;
}

#nprogress {
  pointer-events: none;
}

#nprogress .bar {
  background: #f472b6;
  opacity: 0.75;
  position: fixed;
  z-index: 1031;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
}
</style>
