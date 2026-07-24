<script setup lang="ts">
import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { computed } from 'vue'

import AuthStepForms from '../components/AuthStepForms.vue'

import { buildCurrentOriginAuthUiUrl } from '../modules/auth-ui-base'
import { getServerAuthBootstrapContext } from '../modules/server-auth-context'
import { createServerSignInContext } from '../modules/sign-in'

const bootstrapContext = getServerAuthBootstrapContext()
const apiServerUrl = bootstrapContext?.apiServerUrl ?? SERVER_URL
const currentUrl = bootstrapContext?.currentUrl ?? window.location.href

const signInContext = computed(() => createServerSignInContext(currentUrl, apiServerUrl))

const uiHomeURL = buildCurrentOriginAuthUiUrl()
const effectiveCallbackURL = computed(() =>
  signInContext.value.callbackURL === '/' ? uiHomeURL : signInContext.value.callbackURL,
)
const oidcContinueURL = computed(() =>
  signInContext.value.callbackURL === '/' ? '' : signInContext.value.callbackURL,
)

// Membership is validated inside useEmailAuthFlow; the cast only satisfies its
// OAuthProvider-typed option since the context carries a raw query string.
const requestedProvider = computed(() => signInContext.value.requestedProvider as OAuthProvider | null)
</script>

<template>
  <AuthStepForms
    scope="signIn"
    :api-server-url="apiServerUrl"
    :callback-url="effectiveCallbackURL"
    :verify-continue-url="oidcContinueURL"
    :requested-provider="requestedProvider"
  />
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
