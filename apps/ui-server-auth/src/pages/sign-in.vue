<script setup lang="ts">
import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { defaultSignInProviders } from '@proj-airi/stage-ui/components/auth'
import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { Button } from '@proj-airi/ui'
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
      'min-h-screen flex flex-col items-center justify-center px-6 py-10',
    ]"
  >
    <div
      :class="[
        'mb-8 text-3xl font-bold',
      ]"
    >
      Sign in
    </div>

    <div
      :class="[
        'max-w-xs w-full flex flex-col gap-3',
      ]"
    >
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

    <div
      v-if="errorMessage"
      :class="[
        'mt-4 max-w-xs w-full text-center text-sm text-red-500',
      ]"
    >
      {{ errorMessage }}
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
