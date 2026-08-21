<script setup lang="ts">
import AccountSettingsPage from '@proj-airi/stage-pages/pages/settings/account/account-settings-page.vue'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { signOut } from '@proj-airi/stage-ui/libs/auth'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { electronAuthLogout, electronAuthStartLogin } from '../../../../shared/eventa'

const router = useRouter()
const { t } = useI18n()
const startLogin = useElectronEventaInvoke(electronAuthStartLogin)
const logout = useElectronEventaInvoke(electronAuthLogout)

async function handleLogin() {
  await startLogin()
}

async function handleLogout() {
  // Cancel the current browser flow before waiting for server logout. A later
  // cancellation could otherwise stop a new login started during that wait.
  await logout()

  try {
    await signOut()
  }
  catch (error) {
    console.error('[auth] sign-out failed; local state retained', error)
    toast.error(t('settings.pages.account.signOutFailed'))
    return
  }

  await router.push('/settings')
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
