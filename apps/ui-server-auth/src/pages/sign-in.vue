<script setup lang="ts">
import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { defaultSignInProviders } from '@proj-airi/stage-ui/components/auth'
import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { Button } from '@proj-airi/ui'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { getServerAuthBootstrapContext } from '../modules/server-auth-context'
import { createServerSignInContext, requestSocialSignInRedirect } from '../modules/sign-in'

const route = useRoute()
const { t } = useI18n()
const bootstrapContext = getServerAuthBootstrapContext()
const apiServerUrl = bootstrapContext?.apiServerUrl ?? SERVER_URL
const currentUrl = bootstrapContext?.currentUrl ?? window.location.href

const errorMessage = shallowRef<string | null>(null)
const pendingProvider = shallowRef<OAuthProvider | null>(null)
const autoStartedProvider = shallowRef<OAuthProvider | null>(null)

const providerLookup = new Set<OAuthProvider>(defaultSignInProviders.map(provider => provider.id))

const signInContext = computed(() => createServerSignInContext(currentUrl, apiServerUrl))

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
      apiServerUrl,
      provider,
      callbackURL: signInContext.value.callbackURL,
    })

    window.location.href = redirectUrl
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('server.auth.signIn.error.fallback')
    pendingProvider.value = null
  }
}
</script>

<template>
  <main
    :class="[
      'min-h-screen flex flex-col items-center justify-center px-6 py-10 font-cuteen',
    ]"
  >
    <div
      :class="[
        'mb-8 text-3xl font-bold',
      ]"
    >
      {{ t('server.auth.signIn.title') }}
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

    <div
      :class="[
        'mt-8 text-center text-xs text-gray-400',
      ]"
    >
      {{ t('server.auth.signIn.footer.prefix') }}
      <a
        href="https://airi.moeru.ai/docs/en/about/terms"
        :class="[
          'underline',
        ]"
      >
        {{ t('server.auth.signIn.footer.terms') }}
      </a>
      {{ t('server.auth.signIn.footer.and') }}
      <a
        href="https://airi.moeru.ai/docs/en/about/privacy"
        :class="[
          'underline',
        ]"
      >
        {{ t('server.auth.signIn.footer.privacy') }}
      </a>.
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
