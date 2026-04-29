<script setup lang="ts">
import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { useBroadcastChannel } from '@vueuse/core'
import { computed, onMounted, watch } from 'vue'
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
// sign-up form) so that, when the verification tab signals success, we know
// where to resume the upstream OIDC flow. Empty when the sign-up was not
// initiated inside an OIDC handoff.
const continueURL = computed(() => {
  const value = route.query.continueURL
  return typeof value === 'string' ? value : ''
})

// NOTICE:
// Cross-tab signal between the verification-success tab (the one opened from
// the email link) and the original "check your inbox" tab. Both tabs live on
// the same origin (/auth/...), so BroadcastChannel works without setup.
//
// Why not poll /get-session every 2s? An abandoned pending tab would burn
// 1800 requests/hour for no reason, and the request volume scales with time
// the user takes to check their inbox. With BroadcastChannel the only work
// happens when verification actually finishes.
//
// Why still call /get-session at all? The verifying tab cannot complete the
// OIDC handoff itself — the original tab is the only one carrying the PKCE
// flowState in sessionStorage. So we wait for the signal, then fetch the
// session once to make sure the cookie is live before navigating into the
// OIDC continuation URL.
type VerifyEmailEvent = 'verified'
const { post, data, isSupported } = useBroadcastChannel<VerifyEmailEvent, VerifyEmailEvent>({
  name: 'airi-auth-verify-email',
})

async function resumeIfSessionReady(): Promise<boolean> {
  try {
    const response = await fetch(new URL('/api/auth/get-session', apiServerUrl).toString(), {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok)
      return false

    const payload = await response.json().catch(() => null) as { session?: unknown } | null
    if (!payload?.session)
      return false

    // Same-tab navigation preserves sessionStorage on the destination origin,
    // so the original PKCE flowState saved by the OIDC client is still
    // available when /auth/callback runs.
    window.location.href = continueURL.value || `${window.location.origin}/auth/`
    return true
  }
  catch {
    return false
  }
}

onMounted(async () => {
  // Verification-success tab: announce to any sibling pending tab that the
  // session cookie has been written, then stay put so the user sees the
  // success message. The pending tab does the OIDC continuation.
  if (verified.value) {
    if (isSupported.value)
      post('verified')
    return
  }

  if (error.value)
    return

  // Pending tab: cover the case where verification already happened before
  // this tab subscribed (back-button navigation, page reload, etc.). One
  // session check, no recurring poll.
  await resumeIfSessionReady()
})

// React to a verification event broadcast from the success tab. `data` flips
// from null to 'verified' the moment the message arrives.
watch(data, async (event) => {
  if (event !== 'verified' || verified.value || error.value)
    return

  await resumeIfSessionReady()
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
