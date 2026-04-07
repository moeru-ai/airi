<script setup lang="ts">
import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { defaultSignInProviders, LoginDrawer, SignInPanel } from '@proj-airi/stage-ui/components/auth'
import { useBreakpoints } from '@proj-airi/stage-ui/composables'
import { fetchSession, signInOIDC } from '@proj-airi/stage-ui/libs/auth'
import { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } from '@proj-airi/stage-ui/libs/auth-config'
import { onMounted, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const { isDesktop } = useBreakpoints()

const pendingProvider = shallowRef<OAuthProvider | null>(null)
const errorMessage = shallowRef<string | null>(null)

async function handleSignIn(provider: OAuthProvider) {
  errorMessage.value = null
  pendingProvider.value = provider

  try {
    await signInOIDC({
      clientId: OIDC_CLIENT_ID,
      redirectUri: OIDC_REDIRECT_URI,
      provider,
    })
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'An unknown error occurred'
  }
  finally {
    pendingProvider.value = null
  }
}

onMounted(() => {
  // Check URL for error from failed OAuth callback
  const url = new URL(window.location.href)
  const error = url.searchParams.get('error')
  if (error) {
    errorMessage.value = error === 'auth_failed' ? 'Authentication failed. Please try again.' : error
    url.searchParams.delete('error')
    window.history.replaceState(null, '', url.pathname)
  }

  fetchSession()
    .then((authenticated) => {
      if (authenticated || !isDesktop.value) {
        router.replace('/')
      }
    })
    .catch(() => {})
})

watch(isDesktop, (val) => {
  if (!val) {
    router.replace('/')
  }
})
</script>

<template>
  <main
    v-if="isDesktop"
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
        subtitle="Choose a provider to sign in and return to AIRI."
        @select="handleSignIn"
      />
    </div>
  </main>

  <div v-else class="min-h-screen flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-950">
    <div class="mb-12 flex flex-col items-center gap-4">
      <img src="../../assets/logo.svg" class="h-24 w-24 rounded-3xl shadow-lg">
      <div class="text-3xl font-bold">
        AIRI
      </div>
    </div>

    <LoginDrawer :open="true" />
  </div>
</template>
