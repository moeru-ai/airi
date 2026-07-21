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

// Captured at mount time on the original tab (the one that just submitted the
// sign-up form) so that, when the verification tab signals success, we know
// where to resume the upstream OIDC flow. Empty when the sign-up was not
// initiated inside an OIDC handoff. Also embedded on the email callbackURL so
// the success tab can resume alone when the pending tab is closed.
const continueURL = computed(() => {
  const value = route.query.continueURL
  return typeof value === 'string' ? value : ''
})

// NOTICE:
// Cross-tab signal between the verification-success tab (the one opened from
// the email link) and the original "check your inbox" tab. Both tabs live on
// the same origin (/ui/...), so BroadcastChannel works without setup.
//
// Why not poll /get-session every 2s? An abandoned pending tab would burn
// 1800 requests/hour for no reason, and the request volume scales with time
// the user takes to check their inbox. With BroadcastChannel the only work
// happens when verification actually finishes.
//
// Cross-site auth UI (pages.dev) + API (railway.app): credentials fetch to
// /get-session does not see the session cookie set on the API host during
// verify-email. Runtime evidence (debug 7afbeb): after broadcast,
// resumeIfSessionReady:no-session while Railway had already written
// session_started — so gating resume on get-session blocks desktop login
// online even when BroadcastChannel works. Top-level navigation to
// continueURL (API authorize) sends the cookie; use that after verification.
type VerifyEmailEvent = 'verified'
const { post, data, isSupported } = useBroadcastChannel<VerifyEmailEvent, VerifyEmailEvent>({
  name: 'airi-auth-verify-email',
})

function navigateToContinue(source: string): boolean {
  if (!continueURL.value) {
    // #region agent log
    console.info('[airi-debug:7afbeb]', 'resumeIfSessionReady:no-continueURL', {
      hypothesisId: 'H2',
      source,
    })
    // #endregion
    return false
  }

  // #region agent log
  console.info('[airi-debug:7afbeb]', 'resumeIfSessionReady:navigate', {
    hypothesisId: 'H2',
    source,
    mode: 'top-level',
    hasContinueURL: true,
  })
  // #endregion
  window.location.href = continueURL.value
  return true
}

async function resumeIfSessionReady(source: string): Promise<boolean> {
  // #region agent log
  let continueHost = ''
  try {
    continueHost = continueURL.value ? new URL(continueURL.value).host : ''
  }
  catch {
    continueHost = 'invalid'
  }
  let apiServerHost = ''
  try {
    apiServerHost = new URL(apiServerUrl).host
  }
  catch {
    apiServerHost = 'invalid'
  }
  console.info('[airi-debug:7afbeb]', 'resumeIfSessionReady:start', {
    hypothesisId: 'H2',
    source,
    hasContinueURL: Boolean(continueURL.value),
    continueHost,
    apiServerHost,
  })
  // #endregion

  // Verification already happened (broadcast or email success tab). Do not gate
  // on cross-origin get-session — navigate to authorize with a top-level load.
  if (source === 'broadcast' || source === 'verified-success')
    return navigateToContinue(source)

  // pending-mount: probe get-session only for same-site / already-verified reload.
  // Online cross-site often returns 200 with no session; then we wait for broadcast.
  try {
    const response = await fetch(new URL('/api/auth/get-session', apiServerUrl).toString(), {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) {
      // #region agent log
      console.info('[airi-debug:7afbeb]', 'resumeIfSessionReady:get-session-not-ok', {
        hypothesisId: 'H2',
        source,
        status: response.status,
      })
      // #endregion
      return false
    }

    const payload = await response.json().catch(() => null) as { session?: unknown } | null
    if (!payload?.session) {
      // #region agent log
      console.info('[airi-debug:7afbeb]', 'resumeIfSessionReady:no-session', {
        hypothesisId: 'H2',
        source,
      })
      // #endregion
      return false
    }

    return navigateToContinue(source)
  }
  catch (error) {
    // #region agent log
    console.info('[airi-debug:7afbeb]', 'resumeIfSessionReady:threw', {
      hypothesisId: 'H2',
      source,
      errorName: error instanceof Error ? error.name : 'unknown',
    })
    // #endregion
    return false
  }
}

onMounted(async () => {
  // #region agent log
  console.info('[airi-debug:7afbeb]', 'verify-email:mount', {
    hypothesisId: 'H1',
    verified: verified.value,
    hasError: Boolean(error.value),
    hasContinueURL: Boolean(continueURL.value),
    hasEmail: Boolean(email.value),
    broadcastSupported: isSupported.value,
  })
  // #endregion
  // Verification-success tab: announce to any sibling pending tab, then resume
  // here when continueURL was embedded in the email callback (pending may be gone).
  if (verified.value) {
    trackEmailVerificationCompleted()
    if (isSupported.value) {
      // #region agent log
      console.info('[airi-debug:7afbeb]', 'verify-email:broadcast-post', { hypothesisId: 'H1' })
      // #endregion
      post('verified')
    }
    if (continueURL.value)
      await resumeIfSessionReady('verified-success')
    return
  }

  if (error.value) {
    trackEmailVerificationFailed()
    return
  }

  // Pending tab: cover the case where verification already happened before
  // this tab subscribed (back-button navigation, page reload, etc.). One
  // session check, no recurring poll.
  await resumeIfSessionReady('pending-mount')
})

// React to a verification event broadcast from the success tab. `data` flips
// from null to 'verified' the moment the message arrives.
watch(data, async (event) => {
  if (event !== 'verified' || verified.value || error.value)
    return

  // #region agent log
  console.info('[airi-debug:7afbeb]', 'verify-email:broadcast-received', { hypothesisId: 'H1' })
  // #endregion
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
