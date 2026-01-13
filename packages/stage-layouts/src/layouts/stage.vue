<script setup lang="ts">
import { LoginDrawer } from '@proj-airi/stage-ui/components/auth/index'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useMediaQuery } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { RouterView } from 'vue-router'

const authStore = useAuthStore()
const { isLoginOpen, isAuthenticated } = storeToRefs(authStore)
const isMobile = useMediaQuery('(max-width: 768px)')

watch([isAuthenticated, isMobile], ([auth, mobile]) => {
  if (!auth && mobile) {
    isLoginOpen.value = true
  }
  else {
    isLoginOpen.value = false
  }
})
</script>

<template>
  <main h-full font-cute>
    <RouterView />
    <LoginDrawer v-model:open="isLoginOpen" />
  </main>
</template>
