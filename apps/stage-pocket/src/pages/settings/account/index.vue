<script setup lang="ts">
import AccountSettingsPage from '@proj-airi/stage-pages/pages/settings/account/account-settings-page.vue'

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()

function handleLogin() {
  authStore.needsLogin = true
}

function handleSignedOut() {
  router.push('/settings')
}
</script>

<template>
  <AccountSettingsPage @login="handleLogin" @signed-out="handleSignedOut" />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.account.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.account.description
  icon: i-solar:user-circle-bold-duotone
  settingsEntry: false
  order: 0
  stageTransition:
    name: slide
</route>
