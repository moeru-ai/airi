<script setup lang="ts">
import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { LoginDrawer } from '@proj-airi/stage-ui/components/auth'
import { useBreakpoints } from '@proj-airi/stage-ui/composables'
import { fetchSession, signInOIDC } from '@proj-airi/stage-ui/libs/auth'
import { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } from '@proj-airi/stage-ui/libs/auth-config'
import { Button } from '@proj-airi/ui'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

const router = useRouter()
const { t } = useI18n()

const { isDesktop } = useBreakpoints()

const loginDrawerOpen = ref(true)

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
    toast.error(error instanceof Error ? error.message : t('server.auth.signIn.error.unknown'))
  }
  finally {
    loading.value[provider] = false
  }
}

onMounted(() => {
  const url = new URL(window.location.href)
  const error = url.searchParams.get('error')
  if (error) {
    toast.error(error === 'auth_failed' ? t('server.auth.signIn.error.authFailed') : error)
    url.searchParams.delete('error')
    window.history.replaceState(null, '', url.pathname)
  }

  fetchSession()
    .then((authenticated) => {
      // Do not redirect on !isDesktop — Pocket needs /auth/sign-in on mobile (OIDC + callback retry).
      if (authenticated) {
        router.replace('/')
      }
    })
    .catch(() => {})
})
</script>

<template>
  <div v-if="isDesktop" class="min-h-screen flex flex-col items-center justify-center font-cuteen">
    <div class="mb-8 text-3xl font-bold">
      {{ t('server.auth.signIn.title') }}
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
      {{ t('server.auth.signIn.footer.prefix') }}
      <a href="https://airi.moeru.ai/docs/en/about/terms" class="underline">{{ t('server.auth.signIn.footer.terms') }}</a>
      {{ t('server.auth.signIn.footer.and') }}
      <a href="https://airi.moeru.ai/docs/en/about/privacy" class="underline">{{ t('server.auth.signIn.footer.privacy') }}</a>.
    </div>
  </div>

  <div v-else class="min-h-screen flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-950">
    <div class="mb-12 flex flex-col items-center gap-4">
      <img src="/favicon.svg" class="h-24 w-24 rounded-3xl shadow-lg" alt="">
      <div class="text-3xl font-bold">
        AIRI
      </div>
    </div>

    <button
      v-if="!loginDrawerOpen"
      type="button"
      class="mt-8 rounded-xl bg-primary-500 px-8 py-3 text-sm text-white font-medium shadow-md"
      @click="loginDrawerOpen = true"
    >
      {{ t('server.auth.signIn.title') }}
    </button>

    <LoginDrawer v-model:open="loginDrawerOpen" />
  </div>
</template>
