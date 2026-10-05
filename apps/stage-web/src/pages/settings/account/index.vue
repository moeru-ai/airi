<script setup lang="ts">
import AccountSettingsPage from '@proj-airi/stage-pages/pages/settings/account/account-settings-page.vue'

import { signOut } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

const authStore = useAuthStore()
const router = useRouter()
const { t } = useI18n()

async function handleLogin() {
  await authStore.requestLogin()
}

async function handleLogout() {
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
