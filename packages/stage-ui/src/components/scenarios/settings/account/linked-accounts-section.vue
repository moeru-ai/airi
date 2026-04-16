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
  <div :class="['flex flex-col gap-6 p-6', 'rounded-xl border border-neutral-200 dark:border-neutral-800', 'bg-white dark:bg-neutral-900']">
    <h3 :class="['text-xl font-semibold']">
      {{ t('settings.pages.account.linkedAccounts.title') || 'Linked Accounts' }}
    </h3>

    <Callout v-if="error || localError" theme="orange" :label="(error || localError) ?? undefined" />

    <div v-if="localError && !hasCredential" :class="['flex items-center gap-4']">
      <Button
        variant="primary"
        :loading="loading"
        @click="handleRequestReset"
      >
        {{ t('settings.pages.account.linkedAccounts.sendPasswordLink') || 'Send Password Setup Link' }}
      </Button>
      <span v-if="resetLinkSent" :class="['text-sm text-green-500 dark:text-green-400']">
        {{ t('settings.pages.account.linkedAccounts.linkSent') || 'Link sent to your email.' }}
      </span>
    </div>

    <div :class="['flex flex-col gap-4']">
      <!-- Google -->
      <div :class="['flex items-center justify-between', 'rounded-lg border border-neutral-200 p-4 dark:border-neutral-800']">
        <div :class="['flex items-center gap-3']">
          <div :class="['i-simple-icons:google', 'h-6 w-6 text-neutral-700 dark:text-neutral-300']" />
          <span :class="['font-medium']">Google</span>
        </div>
        <Button
          v-if="hasGoogle"
          variant="secondary"
          :loading="loading"
          @click="handleUnlink('google')"
        >
          {{ t('settings.pages.account.linkedAccounts.unlink') || 'Unlink' }}
        </Button>
        <Button
          v-else
          variant="primary"
          :loading="loading"
          @click="handleLink('google')"
        >
          {{ t('settings.pages.account.linkedAccounts.linkGoogle') || 'Link Google' }}
        </Button>
      </div>

      <!-- GitHub -->
      <div :class="['flex items-center justify-between', 'rounded-lg border border-neutral-200 p-4 dark:border-neutral-800']">
        <div :class="['flex items-center gap-3']">
          <div :class="['i-simple-icons:github', 'h-6 w-6 text-neutral-700 dark:text-neutral-300']" />
          <span :class="['font-medium']">GitHub</span>
        </div>
        <Button
          v-if="hasGitHub"
          variant="secondary"
          :loading="loading"
          @click="handleUnlink('github')"
        >
          {{ t('settings.pages.account.linkedAccounts.unlink') || 'Unlink' }}
        </Button>
        <Button
          v-else
          variant="primary"
          :loading="loading"
          @click="handleLink('github')"
        >
          {{ t('settings.pages.account.linkedAccounts.linkGithub') || 'Link GitHub' }}
        </Button>
      </div>
    </div>
  </div>
</template>
