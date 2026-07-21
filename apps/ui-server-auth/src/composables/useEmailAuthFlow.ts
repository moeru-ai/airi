import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import type { EmailStep } from '../modules/email-auth-flow'

import { defaultSignInProviders } from '@proj-airi/stage-ui/components/auth'
import { reactive, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import {
  trackLoginFailed,
  trackLoginStarted,
  trackLoginSucceeded,
  trackSignupFormCompleted,
} from '../modules/analytics'
import { buildCurrentOriginAuthUiUrl } from '../modules/auth-ui-base'
import { buildVerifyEmailCallbackUrl, decideEmailStep } from '../modules/email-auth-flow'
import { checkEmail, describeAuthError, signInWithEmail, signUpWithEmail } from '../modules/email-password'
import { API_SERVER_URL_QUERY_PARAM } from '../modules/server-auth-context'
import { requestSocialSignInRedirect } from '../modules/sign-in'

export interface UseEmailAuthFlowOptions {
  apiServerUrl: string
  /** Post sign-in / post non-verified sign-up navigation target (OIDC authorize URL or UI home). */
  callbackUrl: string
  /** `continueURL` handed to the verify-email page so it resumes to the OIDC flow. */
  verifyContinueUrl: string
  scope: 'signIn' | 'enroll'
  /** Optional OIDC provider hint that auto-starts social sign-in once. */
  requestedProvider?: OAuthProvider | null
}

/**
 * Shared state + handlers for the email-first auth steps (identify / password /
 * create / social) used by both the unified sign-in page and the Steam enroll
 * page. The two pages differ only in how they compute `callbackUrl` and
 * `verifyContinueUrl`; the step logic, verify-email routing, and provider
 * auto-start are identical.
 *
 * Use when:
 * - Rendering `AuthStepForms.vue` (which calls this composable internally).
 */
export function useEmailAuthFlow(options: UseEmailAuthFlowOptions) {
  const router = useRouter()
  const route = useRoute()
  const { t } = useI18n()

  const step = shallowRef<EmailStep>('identify')
  const errorMessage = shallowRef<string | null>(null)
  const pendingProvider = shallowRef<OAuthProvider | null>(null)
  const identifierLoading = shallowRef(false)
  const credentialsLoading = shallowRef(false)
  const credentials = reactive({ email: '', password: '', confirmPassword: '', name: '' })

  const providerLookup = new Set<OAuthProvider>(defaultSignInProviders.map(provider => provider.id))

  // Surface a redirect-borne `?error=` on the identify step (e.g. a failed
  // OAuth callback bounce-back).
  watch(() => route.query.error, (value) => {
    errorMessage.value = typeof value === 'string' ? value : null
  }, { immediate: true })

  // Auto-start a requested social provider (OIDC handoff hint), once.
  const autoStartedProvider = shallowRef<OAuthProvider | null>(null)
  watch(() => options.requestedProvider ?? null, async (provider) => {
    if (!provider || autoStartedProvider.value === provider)
      return
    if (!providerLookup.has(provider))
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
        apiServerUrl: options.apiServerUrl,
        provider,
        callbackURL: options.callbackUrl,
      })
      trackLoginStarted({ method: provider })
      window.location.href = redirectUrl
    }
    catch (error) {
      trackLoginFailed({ method: provider })
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
      const result = await checkEmail({ apiServerUrl: options.apiServerUrl, email })
      const next = decideEmailStep(result)
      if (next === 'social-only') {
        errorMessage.value = t('server.auth.signIn.error.socialOnlyNoPassword')
        return
      }
      step.value = next
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
        apiServerUrl: options.apiServerUrl,
        email: credentials.email.trim(),
        password: credentials.password,
        callbackURL: options.callbackUrl,
      })
      if (result.requiresVerification) {
        await router.push({
          path: '/verify-email',
          query: {
            email: credentials.email.trim(),
            ...(options.verifyContinueUrl ? { continueURL: options.verifyContinueUrl } : {}),
            ...(options.apiServerUrl ? { [API_SERVER_URL_QUERY_PARAM]: options.apiServerUrl } : {}),
          },
        })
        return
      }
      trackLoginSucceeded({ method: 'email' })
      window.location.href = result.redirectURL ?? options.callbackUrl
    }
    catch (error) {
      trackLoginFailed({ method: 'email' })
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
      const name = options.scope === 'enroll'
        ? ''
        : credentials.name.trim() || email.split('@')[0]
      // NOTICE: carry api_server_url + continueURL onto the verify-email callback.
      // Without api_server_url the success tab falls back to production SERVER_URL.
      // Without continueURL the success tab cannot top-level-resume authorize when
      // the pending tab is closed (and cross-site get-session cannot see the cookie).
      const signUpCallbackURL = buildVerifyEmailCallbackUrl({
        verifyEmailPath: buildCurrentOriginAuthUiUrl('/verify-email'),
        apiServerUrl: options.apiServerUrl,
        apiServerUrlQueryParam: API_SERVER_URL_QUERY_PARAM,
        continueURL: options.verifyContinueUrl || undefined,
      })
      // #region agent log
      console.info('[airi-debug:7afbeb]', 'signup:callbackURL', {
        hypothesisId: 'H3',
        scope: options.scope,
        hasVerifyContinueUrl: Boolean(options.verifyContinueUrl),
        callbackHasContinueURL: signUpCallbackURL.includes('continueURL='),
        pendingWillHaveContinueURL: Boolean(options.verifyContinueUrl),
      })
      // #endregion
      const result = await signUpWithEmail({
        apiServerUrl: options.apiServerUrl,
        email,
        password: credentials.password,
        name,
        callbackURL: signUpCallbackURL,
      })
      if (result.requiresVerification) {
        trackSignupFormCompleted({ source: 'email', requires_verification: true })
        await router.push({
          path: '/verify-email',
          query: {
            email,
            ...(options.verifyContinueUrl ? { continueURL: options.verifyContinueUrl } : {}),
            ...(options.apiServerUrl ? { [API_SERVER_URL_QUERY_PARAM]: options.apiServerUrl } : {}),
          },
        })
        return
      }
      trackSignupFormCompleted({ source: 'email', requires_verification: false })
      window.location.href = options.callbackUrl
    }
    catch (error) {
      errorMessage.value = describeAuthError(error) || t('server.auth.signIn.error.fallback')
    }
    finally {
      credentialsLoading.value = false
    }
  }

  return {
    step,
    errorMessage,
    pendingProvider,
    identifierLoading,
    credentialsLoading,
    credentials,
    handleIdentify,
    handleEmailSignIn,
    handleEmailSignUp,
    handleProviderSelect,
    backToIdentify,
  }
}
