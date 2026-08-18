<script setup lang="ts">
import AccountSettingsPage from '@proj-airi/stage-pages/pages/settings/account/account-settings-page.vue'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { signOut } from '@proj-airi/stage-ui/libs/auth'
import { useRouter } from 'vue-router'

import { electronAuthLogout, electronAuthStartLogin } from '../../../../shared/eventa'

const router = useRouter()
const startLogin = useElectronEventaInvoke(electronAuthStartLogin)
const logout = useElectronEventaInvoke(electronAuthLogout)

async function handleLogin() {
  await startLogin()
}

async function handleLogout() {
  await signOut()
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
