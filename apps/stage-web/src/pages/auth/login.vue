<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { authClient, fetchSession } from '../../composables/auth'

const router = useRouter()

async function signIn(provider: 'google' | 'github') {
  try {
    await authClient.signIn.social({
      provider,
      callbackURL: window.location.origin,
    })

    toast.success('Sign in successful')
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'An unknown error occurred')
  }
}

onMounted(() => {
  fetchSession()
    .then((authenticated) => {
      if (authenticated) {
        router.replace('/')
      }
    })
    .catch(() => {})
})
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center">
    <div class="mb-8 text-3xl font-bold">
      Sign in to AIRI Stage
    </div>
    <div class="max-w-xs w-full flex flex-col gap-3">
      <Button :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']" @click="signIn('google')">
        <div class="i-simple-icons-google" />
        <span>Google</span>
      </Button>
      <Button :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']" @click="signIn('github')">
        <div class="i-simple-icons-github" />
        <span>GitHub</span>
      </Button>
    </div>
    <div class="mt-8 text-xs text-gray-400">
      By continuing, you agree to our <a href="#" class="underline">Terms</a> and <a href="#" class="underline">Privacy Policy</a>.
    </div>
  </div>
</template>
