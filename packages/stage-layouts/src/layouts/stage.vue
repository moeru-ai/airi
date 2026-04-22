<script setup lang="ts">
import { LoginDrawer } from '@proj-airi/stage-ui/components'
import { useBreakpoints } from '@proj-airi/stage-ui/composables'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { isLessonRouteLike } from '@proj-airi/stage-ui/utils'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()
const { isMobile } = useBreakpoints()
const { needsLogin } = storeToRefs(useAuthStore())
const isLessonRoute = computed(() => isLessonRouteLike(route))
</script>

<template>
  <main h-full font-cute>
    <RouterView />

    <LoginDrawer
      v-if="isMobile && !isLessonRoute"
      v-model:open="needsLogin"
    />
  </main>
</template>
