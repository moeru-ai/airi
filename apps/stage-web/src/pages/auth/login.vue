<script setup lang="ts">
import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { LoginDrawer } from '@proj-airi/stage-ui/components/auth'
import { fetchSession, signIn } from '@proj-airi/stage-ui/libs/auth'
import { Button } from '@proj-airi/ui'
import { useMediaQuery } from '@vueuse/core'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

const { t } = useI18n()

const router = useRouter()

const isDesktop = useMediaQuery('(min-width: 768px)')

const loading = ref<Record<OAuthProvider, boolean>>({
  google: false,
  github: false,
})

async function handleSignIn(provider: OAuthProvider) {
  loading.value[provider] = true
  try {
    await signIn(provider)
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'An unknown error occurred')
  }
  finally {
    loading.value[provider] = false
  }
}

onMounted(() => {
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
      {{ t('stage.auth.sign-in') }}
    </div>
    <div class="max-w-xs w-full flex flex-col gap-3">
      <Button
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        :loading="loading.google"
        @click="handleSignIn('google')"
      >
        <div v-if="!loading.google" class="i-simple-icons-google" />
        <span>Google</span>
      </Button>
      <Button
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        :loading="loading.github"
        @click="handleSignIn('github')"
      >
        <div v-if="!loading.github" class="i-simple-icons-github" />
        <span>GitHub</span>
      </Button>
    </div>
    <div class="mt-8 text-xs text-gray-400">
      {{ t('stage.auth.terms-agreement') }}<a href="#" class="underline">{{ t('stage.auth.terms') }}</a>&nbsp;&amp;&nbsp;<a href="#" class="underline">{{ t('stage.auth.privacy-policy') }}</a>
    </div>
  </div>

  <div v-else class="min-h-screen flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-950">
    <div class="mb-12 flex flex-col items-center gap-4">
      <img src="../../assets/logo.svg" class="h-24 w-24 rounded-3xl shadow-lg">
      <div class="text-3xl font-bold">
        AIRI Stage
      </div>
    </div>

    <LoginDrawer :open="true" />
  </div>
</template>
