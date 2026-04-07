<script setup lang="ts">
import { applyOIDCTokens, fetchSession } from '@proj-airi/stage-ui/libs/auth'
import { consumeFlowState, exchangeCodeForTokens } from '@proj-airi/stage-ui/libs/auth-oidc'
import { Button, Callout } from '@proj-airi/ui'
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

function handleTryAgain() {
  router.replace('/auth/sign-in')
}
</script>

<template>
  <div :class="['min-h-screen', 'flex flex-col items-center justify-center']">
    <div v-if="error" :class="['max-w-md', 'flex flex-col items-center']">
      <div class="mb-8 text-3xl font-bold">
        Sign in
      </div>
      <Callout theme="orange" label="We encountered an error while signing you in">
        <div :class="['mt-1', 'text-sm']">
          {{ error }}
        </div>
      </Callout>
      <Button :class="['mt-3 inline-flex']" @click="handleTryAgain">
        Try again
      </Button>
    </div>
    <div v-else :class="['text-center']">
      <div
        aria-hidden="true"
        :class="[
          'mx-auto mb-3',
          'h-10 w-10',
          'i-svg-spinners:ring-resize',
          'text-primary-500',
        ]"
      />
      <div :class="['text-lg']">
        Signing in...
      </div>
    </div>
  </div>
</template>
