<script setup lang="ts">
import { LoginDrawer } from '@proj-airi/stage-ui/components/auth/index'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useMediaQuery } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { RouterView } from 'vue-router'

const isMobile = useMediaQuery('(max-width: 768px)')
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
