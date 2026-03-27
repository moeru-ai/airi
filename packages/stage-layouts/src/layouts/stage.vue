<script setup lang="ts">
import { LoginDrawer } from '@proj-airi/stage-ui/components/auth/index'
import { useBreakpoints } from '@proj-airi/stage-ui/composables'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { storeToRefs } from 'pinia'
import { RouterView } from 'vue-router'

const { isMobile } = useBreakpoints()
const { needsLogin } = storeToRefs(useAuthStore())
</script>

<template>
  <main h-full font-cute>
    <RouterView />

    <Teleport to="body">
      <LoginDrawer
        v-if="isMobile"
        v-model:open="needsLogin"
      />
    </Teleport>
  </main>
</template>
