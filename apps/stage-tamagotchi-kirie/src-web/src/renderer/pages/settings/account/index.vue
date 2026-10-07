<script setup lang="ts">
import AccountSettingsPage from '@proj-airi/stage-pages/pages/settings/account/account-settings-page.vue'

import { useHostAuth } from '@proj-airi/stage-host-context'
import { signOut } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useRouter } from 'vue-router'

import { isAndroidRenderer } from '../../../window-context'

const router = useRouter()
const authStore = useAuthStore()
const { logout, startLogin } = useHostAuth()

async function handleLogin() {
  if (isAndroidRenderer()) {
    await authStore.requestLogin()
    return
  }
  await startLogin()
}

async function handleLogout() {
  await signOut()
  if (!isAndroidRenderer())
    await logout()
  router.push('/settings')
}
</script>

<template>
  <AccountSettingsPage @login="handleLogin" @logout="handleLogout" />
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
