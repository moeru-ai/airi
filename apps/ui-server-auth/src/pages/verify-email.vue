<script setup lang="ts">
import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { getServerAuthBootstrapContext } from '../modules/server-auth-context'

const { t } = useI18n()
const route = useRoute()
const bootstrapContext = getServerAuthBootstrapContext()
const apiServerUrl = bootstrapContext?.apiServerUrl ?? SERVER_URL

// Two distinct entry shapes share this page:
// 1) Post-sign-up notice screen: query is `?email=user@host`, no `error`.
// 2) Verification landing after better-auth redirected from /api/auth/verify-email.
//    On success: `?verified=true`. On failure: `?error=...&status=failed`.
const email = computed(() => {
  const value = route.query.email
  return typeof value === 'string' ? value : ''
})

const error = computed(() => {
  const value = route.query.error
  return typeof value === 'string' ? value : null
})

const verified = computed(() => route.query.verified === 'true')

// Captured at mount time on the original tab (the one that just submitted the
// sign-up form) so that, when polling detects an active session, we know
// where to resume the upstream OIDC flow. Empty when the sign-up was not
// initiated inside an OIDC handoff.
const continueURL = computed(() => {
  const value = route.query.continueURL
  return typeof value === 'string' ? value : ''
})

const pollHandle = shallowRef<ReturnType<typeof setInterval> | null>(null)

// Poll the better-auth session endpoint while the user is still on the
// "check your inbox" pending state. Once the user clicks the verification
// link in another tab, `autoSignInAfterVerification` writes the session
// cookie on the API origin; this tab then sees a populated session and
// redirects to the OIDC continuation (or the UI home).
async function tickSessionCheck() {
  try {
    const response = await fetch(new URL('/api/auth/get-session', apiServerUrl).toString(), {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok)
      return

    const data = await response.json().catch(() => null) as { session?: unknown } | null
    if (!data?.session)
      return

    if (pollHandle.value) {
      clearInterval(pollHandle.value)
      pollHandle.value = null
    }

    // Same-tab navigation preserves sessionStorage on the destination origin,
    // so the original PKCE flowState saved by the OIDC client is still
    // available when /auth/callback runs.
    window.location.href = continueURL.value || `${window.location.origin}/auth/`
  }
  catch {
    // Transient network failure — keep polling.
  }
}

onMounted(() => {
  // Only the pending state needs to wait for verification. The verified-success
  // and error states are terminal.
  if (verified.value || error.value)
    return

  // Cheap server hop, every 2 seconds is responsive without being abusive.
  pollHandle.value = setInterval(tickSessionCheck, 2000)
  void tickSessionCheck()
})

onBeforeUnmount(() => {
  if (pollHandle.value) {
    clearInterval(pollHandle.value)
    pollHandle.value = null
  }
})
</script>

<template>
  <main
    :class="[
      'min-h-screen flex flex-col items-center justify-center px-6 py-10 font-cuteen',
    ]"
  >
    <div :class="['mb-6 text-2xl font-bold']">
      {{
        error
          ? t('server.auth.verifyEmail.title.failed')
          : verified
            ? t('server.auth.verifyEmail.title.success')
            : t('server.auth.verifyEmail.title.pending')
      }}
    </div>

    <p
      v-if="error"
      :class="['max-w-sm text-center text-sm text-red-500']"
    >
      {{ t('server.auth.verifyEmail.message.failed', { error }) }}
    </p>
    <p
      v-else-if="verified"
      :class="['max-w-sm text-center text-sm text-neutral-600 dark:text-neutral-300']"
    >
      {{ t('server.auth.verifyEmail.message.success') }}
    </p>
    <p
      v-else
      :class="['max-w-sm text-center text-sm text-neutral-600 dark:text-neutral-300']"
    >
      {{
        email
          ? t('server.auth.verifyEmail.message.pendingWithAddress', { email })
          : t('server.auth.verifyEmail.message.pending')
      }}
    </p>

    <RouterLink
      to="/sign-in"
      :class="['mt-8 text-xs text-neutral-500 underline']"
    >
      {{ t('server.auth.verifyEmail.action.backToSignIn') }}
    </RouterLink>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
