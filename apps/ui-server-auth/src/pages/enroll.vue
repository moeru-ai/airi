<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AuthStepForms from '../components/AuthStepForms.vue'

import { createEnrollContext } from '../modules/email-auth-flow'
import { getServerAuthBootstrapContext } from '../modules/server-auth-context'

const { t } = useI18n()
const bootstrapContext = getServerAuthBootstrapContext()
const currentUrl = bootstrapContext?.currentUrl ?? window.location.href

const enrollContext = computed(() => createEnrollContext(currentUrl))

// Re-attach the single-use enrollToken to the authorize URL so the authorize
// choke point (apps/server routes/auth/index.ts) consumes it and links Steam.
const resumeURL = computed(() => {
  const ctx = enrollContext.value
  if (!ctx)
    return ''
  const url = new URL(ctx.continueUrl)
  url.searchParams.set('enrollToken', ctx.enrollToken)
  return url.toString()
})
</script>

<template>
  <AuthStepForms
    v-if="enrollContext"
    scope="enroll"
    :api-server-url="enrollContext.apiServerUrl"
    :callback-url="resumeURL"
    :verify-continue-url="resumeURL"
  />

  <main
    v-else
    :class="['min-h-screen flex flex-col items-center justify-center px-6 py-10 font-cuteen']"
  >
    <div :class="['mb-2 text-2xl font-bold']">
      {{ t('server.auth.enroll.error.invalidLink') }}
    </div>
    <p :class="['mb-6 max-w-sm text-center text-sm text-neutral-500']">
      {{ t('server.auth.enroll.error.invalidLinkDescription') }}
    </p>
    <RouterLink to="/sign-in" :class="['text-xs text-neutral-500 underline']">
      {{ t('server.auth.verifyEmail.action.backToSignIn') }}
    </RouterLink>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
