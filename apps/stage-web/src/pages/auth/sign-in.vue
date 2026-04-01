<script setup lang="ts">
import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { LoginDrawer } from '@proj-airi/stage-ui/components/auth'
import { useBreakpoints } from '@proj-airi/stage-ui/composables'
import { fetchSession, signInOIDC } from '@proj-airi/stage-ui/libs/auth'
import { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } from '@proj-airi/stage-ui/libs/auth-config'
import { Button } from '@proj-airi/ui'
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

const router = useRouter()

const { isDesktop } = useBreakpoints()

const loading = ref<Record<OAuthProvider, boolean>>({
  google: false,
  github: false,
})

async function handleSignIn(provider: OAuthProvider) {
  loading.value[provider] = true
  try {
    await signInOIDC({
      clientId: OIDC_CLIENT_ID,
      redirectUri: OIDC_REDIRECT_URI,
      provider,
    })
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'An unknown error occurred')
  }
  finally {
    loading.value[provider] = false
  }
}

onMounted(() => {
  // Check URL for error from failed OAuth callback
  const url = new URL(window.location.href)
  const error = url.searchParams.get('error')
  if (error) {
    toast.error(error === 'auth_failed' ? 'Authentication failed. Please try again.' : error)
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
  <div v-if="isDesktop" class="min-h-screen flex flex-col items-center justify-center">
    <div class="mb-8 text-3xl font-bold">
      Sign in
    </div>
    <div class="max-w-xs w-full flex flex-col gap-3">
      <Button
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        icon="i-simple-icons-google"
        :loading="loading.google"
        @click="handleSignIn('google')"
      >
        <span>Google</span>
      </Button>
      <Button
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        icon="i-simple-icons-github"
        :loading="loading.github"
        @click="handleSignIn('github')"
      >
        <span>GitHub</span>
      </Button>
    </div>
    <div class="mt-8 text-xs text-gray-400">
      By continuing, you agree to our <a href="https://airi.moeru.ai/docs/en/about/terms" class="underline">Terms</a> and <a href="https://airi.moeru.ai/docs/en/about/privacy" class="underline">Privacy Policy</a>.
    </div>
  </div>

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
