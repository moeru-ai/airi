<script setup lang="ts">
import { Button, Callout } from '@proj-airi/ui'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAccountManagement } from '../../../../composables/use-account-management'

const { t } = useI18n()
const {
  hasCredential,
  hasGoogle,
  hasGitHub,
  linkProvider,
  unlinkProvider,
  requestPasswordReset,
  loadAccounts,
  loading,
  error,
} = useAccountManagement()

const localError = ref<string | null>(null)
const resetLinkSent = ref(false)

onMounted(() => {
  loadAccounts()
})

async function handleLink(provider: 'google' | 'github') {
  localError.value = null
  resetLinkSent.value = false
  await linkProvider(provider)
}

async function handleUnlink(providerId: 'google' | 'github') {
  localError.value = null
  resetLinkSent.value = false

  const { needsPassword } = await unlinkProvider(providerId)

  if (needsPassword) {
    localError.value = t('settings.pages.account.linkedAccounts.needPassword') || '请先设置密码才能解绑 (You must set a password before unlinking)'
  }
}

async function handleRequestReset() {
  localError.value = null
  resetLinkSent.value = false

  await requestPasswordReset()

  if (!error.value) {
    resetLinkSent.value = true
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-6 p-8', 'rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm', 'bg-white dark:bg-neutral-900']">
    <div :class="['flex flex-col gap-1']">
      <h3 :class="['text-xl font-bold text-neutral-900 dark:text-white']">
        {{ t('settings.pages.account.linkedAccounts.title') || 'Linked Accounts' }}
      </h3>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        Connect your accounts to easily sign in across all your devices.
      </p>
    </div>

    <Callout v-if="error || localError" theme="orange" :label="(error || localError) ?? undefined" />

    <div v-if="localError && !hasCredential" :class="['flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-orange-50 dark:bg-orange-950/30 p-4 rounded-xl border border-orange-100 dark:border-orange-900/50']">
      <div :class="['flex-1 text-sm text-orange-800 dark:text-orange-300 font-medium']">
        You need a password before unlinking your only social account.
      </div>
      <div :class="['flex items-center gap-3']">
        <Button
          variant="primary"
          :class="['rounded-xl shadow-sm']"
          :loading="loading"
          @click="handleRequestReset"
        >
          {{ t('settings.pages.account.linkedAccounts.sendPasswordLink') || 'Send Password Setup Link' }}
        </Button>
        <span v-if="resetLinkSent" :class="['text-sm font-medium text-green-600 dark:text-green-400']">
          {{ t('settings.pages.account.linkedAccounts.linkSent') || 'Sent!' }}
        </span>
      </div>
    </div>

    <div :class="['flex flex-col gap-4 mt-2']">
      <!-- Google -->
      <div :class="['flex items-center justify-between', 'rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 bg-neutral-50/50 dark:bg-neutral-800/20 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors']">
        <div :class="['flex items-center gap-4']">
          <div :class="['p-2 rounded-lg bg-white dark:bg-neutral-800 shadow-sm border border-neutral-100 dark:border-neutral-700']">
            <div :class="['i-simple-icons:google', 'size-5 text-neutral-700 dark:text-neutral-300']" />
          </div>
          <div :class="['flex flex-col']">
            <span :class="['font-semibold text-neutral-900 dark:text-white']">Google</span>
            <span :class="['text-xs text-neutral-500 dark:text-neutral-400 mt-0.5']">
              {{ hasGoogle ? 'Connected' : 'Not connected' }}
            </span>
          </div>
        </div>
        <Button
          v-if="hasGoogle"
          variant="secondary"
          :class="['rounded-xl px-5 text-sm']"
          :loading="loading"
          @click="handleUnlink('google')"
        >
          {{ t('settings.pages.account.linkedAccounts.unlink') || 'Unlink' }}
        </Button>
        <Button
          v-else
          variant="primary"
          :class="['rounded-xl px-5 text-sm shadow-sm']"
          :loading="loading"
          @click="handleLink('google')"
        >
          {{ t('settings.pages.account.linkedAccounts.linkGoogle') || 'Connect' }}
        </Button>
      </div>

      <!-- GitHub -->
      <div :class="['flex items-center justify-between', 'rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 bg-neutral-50/50 dark:bg-neutral-800/20 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors']">
        <div :class="['flex items-center gap-4']">
          <div :class="['p-2 rounded-lg bg-white dark:bg-neutral-800 shadow-sm border border-neutral-100 dark:border-neutral-700']">
            <div :class="['i-simple-icons:github', 'size-5 text-neutral-700 dark:text-neutral-300']" />
          </div>
          <div :class="['flex flex-col']">
            <span :class="['font-semibold text-neutral-900 dark:text-white']">GitHub</span>
            <span :class="['text-xs text-neutral-500 dark:text-neutral-400 mt-0.5']">
              {{ hasGitHub ? 'Connected' : 'Not connected' }}
            </span>
          </div>
        </div>
        <Button
          v-if="hasGitHub"
          variant="secondary"
          :class="['rounded-xl px-5 text-sm']"
          :loading="loading"
          @click="handleUnlink('github')"
        >
          {{ t('settings.pages.account.linkedAccounts.unlink') || 'Unlink' }}
        </Button>
        <Button
          v-else
          variant="primary"
          :class="['rounded-xl px-5 text-sm shadow-sm']"
          :loading="loading"
          @click="handleLink('github')"
        >
          {{ t('settings.pages.account.linkedAccounts.linkGithub') || 'Connect' }}
        </Button>
      </div>
    </div>
  </div>
</template>
