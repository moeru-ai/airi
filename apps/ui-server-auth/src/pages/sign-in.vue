<script setup lang="ts">
import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { defaultSignInProviders } from '@proj-airi/stage-ui/components/auth'
import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { Button, FieldInput } from '@proj-airi/ui'
import { computed, reactive, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import {
  checkEmail,
  describeAuthError,
  signInWithEmail,
  signUpWithEmail,
} from '../modules/email-password'
import { getServerAuthBootstrapContext } from '../modules/server-auth-context'
import { createServerSignInContext, requestSocialSignInRedirect } from '../modules/sign-in'

type Step = 'identify' | 'password' | 'create'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const bootstrapContext = getServerAuthBootstrapContext()
const apiServerUrl = bootstrapContext?.apiServerUrl ?? SERVER_URL
const currentUrl = bootstrapContext?.currentUrl ?? window.location.href

const step = shallowRef<Step>('identify')
const errorMessage = shallowRef<string | null>(null)
const pendingProvider = shallowRef<OAuthProvider | null>(null)
const autoStartedProvider = shallowRef<OAuthProvider | null>(null)
const identifierLoading = shallowRef(false)
const credentialsLoading = shallowRef(false)

const credentials = reactive({
  email: '',
  password: '',
  confirmPassword: '',
  name: '',
})

const providerLookup = new Set<OAuthProvider>(defaultSignInProviders.map(provider => provider.id))

const signInContext = computed(() => createServerSignInContext(currentUrl, apiServerUrl))

// Outside an OIDC flow signInContext.callbackURL is bare `/` which Better Auth
// resolves against the API server origin (404). Fall back to the UI root so
// the user lands somewhere useful — the `/auth/` index route redirects to
// `/auth/profile` so this is not the dead-end empty RouterView it once was.
const uiHomeURL = `${window.location.origin}/auth/`
const verifySuccessURL = `${window.location.origin}/auth/verify-email?verified=true`

const effectiveCallbackURL = computed(() =>
  signInContext.value.callbackURL === '/' ? uiHomeURL : signInContext.value.callbackURL,
)
// NOTICE:
// We always send the verification email's callbackURL to the local
// verify-email success page, never to the OIDC `/oauth2/authorize` URL.
// Email links open in a new tab where sessionStorage (and therefore the PKCE
// flowState saved by the OIDC client) is empty, so a direct OIDC handoff in
// that tab would fail with "Missing OIDC flow state". Instead, the original
// tab polls the session and resumes the OIDC flow itself once the cookie is
// set by `autoSignInAfterVerification`.
const signUpCallbackURL = verifySuccessURL
// OIDC continuation URL surfaced to the verify-email page, so it can resume
// the original flow once the session cookie appears. Empty string means there
// was no OIDC client in the picture (just a vanilla sign-up).
const oidcContinueURL = computed(() =>
  signInContext.value.callbackURL === '/' ? '' : signInContext.value.callbackURL,
)

const requestedProvider = computed<OAuthProvider | null>(() => {
  const provider = signInContext.value.requestedProvider

  if (!provider || !providerLookup.has(provider as OAuthProvider))
    return null

  return provider as OAuthProvider
})

const stepHeading = computed(() => {
  if (step.value === 'password')
    return t('server.auth.signIn.step.password.heading')
  if (step.value === 'create')
    return t('server.auth.signIn.step.create.heading')
  return t('server.auth.signIn.step.identify.heading')
})

const stepDescription = computed(() => {
  if (step.value === 'password')
    return t('server.auth.signIn.step.password.description', { email: credentials.email })
  if (step.value === 'create')
    return t('server.auth.signIn.step.create.description', { email: credentials.email })
  return t('server.auth.signIn.step.identify.description')
})

watch(() => route.query.error, (value) => {
  errorMessage.value = typeof value === 'string' ? value : null
}, { immediate: true })

watch(requestedProvider, async (provider) => {
  if (!provider || autoStartedProvider.value === provider)
    return

  autoStartedProvider.value = provider
  await handleProviderSelect(provider)
}, { immediate: true })

function backToIdentify() {
  errorMessage.value = null
  credentials.password = ''
  credentials.confirmPassword = ''
  credentials.name = ''
  step.value = 'identify'
}

async function handleProviderSelect(provider: OAuthProvider) {
  errorMessage.value = null
  pendingProvider.value = provider

  try {
    const redirectUrl = await requestSocialSignInRedirect({
      apiServerUrl,
      provider,
      callbackURL: effectiveCallbackURL.value,
    })

    window.location.href = redirectUrl
  }
  catch (error) {
    errorMessage.value = describeAuthError(error) || t('server.auth.signIn.error.fallback')
    pendingProvider.value = null
  }
}

async function handleIdentify(event: Event) {
  event.preventDefault()
  if (identifierLoading.value)
    return

  errorMessage.value = null
  identifierLoading.value = true

  try {
    const email = credentials.email.trim()
    const result = await checkEmail({ apiServerUrl, email })

    if (result.exists && !result.hasPassword) {
      // User signed up via a social provider only. Stay on the identifier step
      // so the OAuth buttons remain visible, and steer them there with a hint.
      errorMessage.value = t('server.auth.signIn.error.authFailed')
      // NOTICE:
      // We avoid disclosing *which* social provider they used here. The
      // generic OAuth button row is right below; users who registered via
      // Google/GitHub will recognize and use it.
      return
    }

    step.value = result.exists ? 'password' : 'create'
  }
  catch (error) {
    errorMessage.value = describeAuthError(error) || t('server.auth.signIn.error.fallback')
  }
  finally {
    identifierLoading.value = false
  }
}

async function handleEmailSignIn(event: Event) {
  event.preventDefault()
  if (credentialsLoading.value)
    return

  errorMessage.value = null
  credentialsLoading.value = true

  try {
    const result = await signInWithEmail({
      apiServerUrl,
      email: credentials.email.trim(),
      password: credentials.password,
      callbackURL: effectiveCallbackURL.value,
    })

    if (result.requiresVerification) {
      // Existing-but-unverified accounts that started from /oauth2/authorize
      // must carry the OIDC continuation through verification. Without it the
      // verify-email tab would resume to /auth/profile after the cookie lands
      // and the upstream stage app never receives its auth code/tokens.
      await router.push({
        path: '/verify-email',
        query: {
          email: credentials.email.trim(),
          ...(oidcContinueURL.value ? { continueURL: oidcContinueURL.value } : {}),
        },
      })
      return
    }

    // After a successful credential sign-in better-auth has set the session
    // cookie. Bounce into the OIDC `/oauth2/authorize` flow (or wherever the
    // OIDC client originally pointed) so the upstream stage app gets its tokens.
    window.location.href = result.redirectURL ?? effectiveCallbackURL.value
  }
  catch (error) {
    errorMessage.value = describeAuthError(error) || t('server.auth.signIn.error.fallback')
  }
  finally {
    credentialsLoading.value = false
  }
}

async function handleEmailSignUp(event: Event) {
  event.preventDefault()
  if (credentialsLoading.value)
    return

  errorMessage.value = null

  if (credentials.password !== credentials.confirmPassword) {
    errorMessage.value = t('server.auth.signIn.error.passwordMismatch')
    return
  }

  credentialsLoading.value = true
  try {
    const email = credentials.email.trim()
    const name = credentials.name.trim() || email.split('@')[0]
    const result = await signUpWithEmail({
      apiServerUrl,
      email,
      password: credentials.password,
      name,
      callbackURL: signUpCallbackURL,
    })

    if (result.requiresVerification) {
      await router.push({
        path: '/verify-email',
        query: {
          email,
          ...(oidcContinueURL.value ? { continueURL: oidcContinueURL.value } : {}),
        },
      })
      return
    }

    // Verification disabled at server config: session is live, fall through
    // to the OIDC continuation just like sign-in.
    window.location.href = effectiveCallbackURL.value
  }
  catch (error) {
    errorMessage.value = describeAuthError(error) || t('server.auth.signIn.error.fallback')
  }
  finally {
    credentialsLoading.value = false
  }
}
</script>

<template>
  <main
    :class="[
      'min-h-screen flex flex-col items-center justify-center px-6 py-10 font-cuteen',
    ]"
  >
    <div :class="['mb-2 text-3xl font-bold']">
      {{ stepHeading }}
    </div>
    <div :class="['mb-4 max-w-xs text-center text-sm text-neutral-500']">
      {{ stepDescription }}
    </div>

    <!-- Reserve space for the error region so a transition into the error
         state doesn't shove the form downward. Renders an empty paragraph
         when there's nothing to show; the role swaps to alert when populated. -->
    <div
      :class="[
        'mb-2 max-w-xs w-full min-h-[1.25rem] text-center text-sm',
        errorMessage ? 'text-red-500' : 'text-transparent select-none',
      ]"
      :role="errorMessage ? 'alert' : undefined"
      :aria-live="errorMessage ? 'polite' : undefined"
    >
      {{ errorMessage || '·' }}
    </div>

    <!-- Step 1: identify -->
    <form
      v-if="step === 'identify'"
      :class="['max-w-xs w-full flex flex-col gap-3']"
      @submit="handleIdentify"
    >
      <FieldInput
        v-model="credentials.email"
        type="email"
        :label="t('server.auth.signIn.email.label')"
        :placeholder="t('server.auth.signIn.email.placeholder')"
        required
        hide-required-mark
      />

      <Button
        type="submit"
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        :loading="identifierLoading"
      >
        <span>{{ t('server.auth.signIn.action.continue') }}</span>
      </Button>
    </form>

    <!-- Step 2A: existing user, password -->
    <form
      v-else-if="step === 'password'"
      :class="['max-w-xs w-full flex flex-col gap-3']"
      @submit="handleEmailSignIn"
    >
      <FieldInput
        v-model="credentials.password"
        type="password"
        :label="t('server.auth.signIn.password.label')"
        :placeholder="t('server.auth.signIn.password.placeholder')"
        required
        hide-required-mark
      />

      <Button
        type="submit"
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        :loading="credentialsLoading"
      >
        <span>{{ t('server.auth.signIn.action.signIn') }}</span>
      </Button>

      <div :class="['flex items-center justify-between text-xs text-neutral-500']">
        <RouterLink to="/forgot-password" :class="['underline']">
          {{ t('server.auth.signIn.action.forgotPassword') }}
        </RouterLink>
        <button type="button" :class="['underline']" @click="backToIdentify">
          {{ t('server.auth.signIn.action.useDifferentEmail') }}
        </button>
      </div>
    </form>

    <!-- Step 2B: new user, sign up -->
    <form
      v-else
      :class="['max-w-xs w-full flex flex-col gap-3']"
      @submit="handleEmailSignUp"
    >
      <FieldInput
        v-model="credentials.name"
        type="text"
        :label="t('server.auth.signIn.name.label')"
        :placeholder="t('server.auth.signIn.name.placeholder')"
      />
      <FieldInput
        v-model="credentials.password"
        type="password"
        :label="t('server.auth.signIn.newPassword.label')"
        :placeholder="t('server.auth.signIn.newPassword.placeholder')"
        required
        hide-required-mark
      />
      <FieldInput
        v-model="credentials.confirmPassword"
        type="password"
        :label="t('server.auth.signIn.confirmPassword.label')"
        :placeholder="t('server.auth.signIn.confirmPassword.placeholder')"
        required
        hide-required-mark
      />

      <Button
        type="submit"
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        :loading="credentialsLoading"
      >
        <span>{{ t('server.auth.signIn.action.createAccount') }}</span>
      </Button>

      <div :class="['flex items-center justify-end text-xs text-neutral-500']">
        <button type="button" :class="['underline']" @click="backToIdentify">
          {{ t('server.auth.signIn.action.useDifferentEmail') }}
        </button>
      </div>
    </form>

    <!-- OAuth buttons: only on identifier step. After picking an email/password
         path, the OAuth options stay one click away via "use a different email". -->
    <template v-if="step === 'identify'">
      <div :class="['my-6 max-w-xs w-full flex items-center gap-3 text-xs text-neutral-400']">
        <div :class="['h-px flex-1 bg-neutral-200 dark:bg-neutral-700']" />
        <span>{{ t('server.auth.signIn.divider.or') }}</span>
        <div :class="['h-px flex-1 bg-neutral-200 dark:bg-neutral-700']" />
      </div>

      <div :class="['max-w-xs w-full flex flex-col gap-3']">
        <Button
          v-for="provider in defaultSignInProviders"
          :key="provider.id"
          :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
          :icon="provider.id === 'google' ? 'i-simple-icons-google' : provider.id === 'github' ? 'i-simple-icons-github' : undefined"
          :loading="pendingProvider === provider.id"
          @click="handleProviderSelect(provider.id)"
        >
          <span>{{ provider.name }}</span>
        </Button>
      </div>
    </template>

    <div :class="['mt-8 text-center text-xs text-gray-400']">
      {{ t('server.auth.signIn.footer.prefix') }}
      <a href="https://airi.moeru.ai/docs/en/about/terms" :class="['underline']">
        {{ t('server.auth.signIn.footer.terms') }}
      </a>
      {{ t('server.auth.signIn.footer.and') }}
      <a href="https://airi.moeru.ai/docs/en/about/privacy" :class="['underline']">
        {{ t('server.auth.signIn.footer.privacy') }}
      </a>.
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
