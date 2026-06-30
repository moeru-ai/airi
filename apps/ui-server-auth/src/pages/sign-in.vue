<script setup lang="ts">
import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { defaultSignInProviders } from '@proj-airi/stage-ui/components/auth'
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

const providerLookup = new Set<OAuthProvider>(defaultSignInProviders.map(provider => provider.id))
const requestedProvider = computed<OAuthProvider | null>(() => {
  const provider = signInContext.value.requestedProvider
  if (!provider || !providerLookup.has(provider as OAuthProvider))
    return null
  return provider as OAuthProvider
})
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
