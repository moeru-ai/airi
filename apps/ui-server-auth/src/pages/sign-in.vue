<script setup lang="ts">
import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { defaultSignInProviders, SignInPanel } from '@proj-airi/stage-ui/components/auth'
import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { computed, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'

import { createServerSignInContext, requestSocialSignInRedirect } from '../modules/sign-in'

const route = useRoute()

const errorMessage = shallowRef<string | null>(null)
const pendingProvider = shallowRef<OAuthProvider | null>(null)
const autoStartedProvider = shallowRef<OAuthProvider | null>(null)

const providerLookup = new Set<OAuthProvider>(defaultSignInProviders.map(provider => provider.id))

const signInContext = computed(() => createServerSignInContext(window.location.href, SERVER_URL))

const requestedProvider = computed<OAuthProvider | null>(() => {
  const provider = signInContext.value.requestedProvider

  if (!provider || !providerLookup.has(provider as OAuthProvider))
    return null

  return provider as OAuthProvider
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

async function handleProviderSelect(provider: OAuthProvider) {
  errorMessage.value = null
  pendingProvider.value = provider

  try {
    const redirectUrl = await requestSocialSignInRedirect({
      apiServerUrl: SERVER_URL,
      provider,
      callbackURL: signInContext.value.callbackURL,
    })

    window.location.href = redirectUrl
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Sign in failed'
    pendingProvider.value = null
  }
}
</script>

<template>
  <main
    :class="[
      'relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(115,190,255,0.18),_transparent_45%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(243,244,246,0.96))] px-6 py-10',
      'dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_38%),linear-gradient(180deg,_rgba(3,7,18,0.98),_rgba(10,15,28,0.98))]',
      'flex items-center justify-center',
    ]"
  >
    <div
      :class="[
        'pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-primary-300/20 blur-3xl',
        'dark:bg-primary-500/10',
      ]"
    />

    <div :class="['relative w-full max-w-md']">
      <SignInPanel
        :providers="defaultSignInProviders"
        :pending-provider="pendingProvider"
        :error="errorMessage"
        subtitle="Pick a provider to resume the AIRI authorization flow."
        @select="handleProviderSelect"
      />
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
