<script setup lang="ts">
import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { useBroadcastChannel } from '@vueuse/core'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { trackEmailVerificationCompleted, trackEmailVerificationFailed } from '../modules/analytics'
import { API_SERVER_URL_QUERY_PARAM, getServerAuthBootstrapContext } from '../modules/server-auth-context'

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

// OIDC / enroll resume target. Present on the pending tab after sign-up, and on
// the email success tab when embedded in the verification callbackURL.
const continueURL = computed(() => {
  const value = route.query.continueURL
  return typeof value === 'string' ? value : ''
})

// NOTICE:
// Cross-tab signal between the email-link success tab and the original
// "check your inbox" tab (same origin → BroadcastChannel).
//
// Do not poll /get-session: an abandoned pending tab would burn request quota.
//
// After verification, resume with a top-level navigation to continueURL.
// A credentials fetch to /get-session from a cross-site auth UI host cannot
// see the API session cookie (SameSite); authorize navigation can.
// pending-mount still probes get-session for same-site / already-verified reload.
type VerifyEmailEvent = 'verified'
const { post, data, isSupported } = useBroadcastChannel<VerifyEmailEvent, VerifyEmailEvent>({
  name: 'airi-auth-verify-email',
})

function navigateToContinue(): boolean {
  if (!continueURL.value)
    return false
  window.location.href = continueURL.value
  return true
}

async function resumeIfSessionReady(source: 'pending-mount' | 'broadcast' | 'verified-success'): Promise<boolean> {
  if (source === 'broadcast' || source === 'verified-success')
    return navigateToContinue()

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

    return navigateToContinue()
  }
  catch {
    return false
  }
}

onMounted(async () => {
  if (verified.value) {
    trackEmailVerificationCompleted()
    if (isSupported.value)
      post('verified')
    if (continueURL.value)
      await resumeIfSessionReady('verified-success')
    return
  }

  if (error.value) {
    trackEmailVerificationFailed()
    return
  }

  // Already-verified reload / late subscription: one get-session probe, no poll.
  await resumeIfSessionReady('pending-mount')
})

watch(data, async (event) => {
  if (event !== 'verified' || verified.value || error.value)
    return

  await resumeIfSessionReady('broadcast')
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
      :to="{ path: '/sign-in', query: { [API_SERVER_URL_QUERY_PARAM]: apiServerUrl } }"
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
