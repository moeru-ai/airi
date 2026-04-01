<script setup lang="ts">
import { applyOIDCTokens, fetchSession } from '@proj-airi/stage-ui/libs/auth'
import { consumeFlowState, exchangeCodeForTokens } from '@proj-airi/stage-ui/libs/auth-oidc'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const error = ref<string | null>(null)

onMounted(async () => {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  if (errorParam) {
    error.value = url.searchParams.get('error_description') ?? errorParam
    return
  }

  if (!code || !state) {
    error.value = 'Missing authorization code or state'
    return
  }

  const persisted = consumeFlowState()
  if (!persisted) {
    error.value = 'Missing OIDC flow state — please try logging in again'
    return
  }

  try {
    const tokens = await exchangeCodeForTokens(code, persisted.flowState, persisted.params, state)
    await applyOIDCTokens(tokens, persisted.params.clientId)
    await fetchSession()
    router.replace('/')
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Token exchange failed'
  }
})
</script>

<template>
  <div :class="['min-h-screen', 'flex flex-col items-center justify-center']">
    <div v-if="error" :class="['max-w-md', 'text-center']">
      <div :class="['text-lg font-semibold', 'text-red-600 dark:text-red-400']">
        Authentication failed
      </div>
      <div :class="['mt-2', 'text-sm text-gray-500']">
        {{ error }}
      </div>
      <a href="/auth/sign-in" :class="['mt-4 inline-block', 'text-sm underline']">
        Try again
      </a>
    </div>
    <div v-else :class="['text-center']">
      <div :class="['text-lg']">
        Signing in...
      </div>
    </div>
  </div>
</template>
