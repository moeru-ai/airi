<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { API_SERVER_URL, authClient } from '../../composables/auth'

const router = useRouter()

async function signIn(type: 'google' | 'github') {
  const { error, data } = await authClient.signIn.social({
    provider: type,
    callbackURL: `${API_SERVER_URL}/api/auth/callback/${type}`,
  })

  if (error) {
    toast.error(error?.message || 'An unknown error occurred')
  }

  if (data && data.redirect && data.url) {
    // window.open(data.url, '_blank')
    router.replace(data.url)
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center">
    <div class="mb-8 text-3xl font-bold">
      Sign in to AIRI Stage
    </div>
    <div class="max-w-xs w-full flex flex-col gap-3">
      <Button :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']" icon="mdi:google" @click="signIn('google')">
        <div class="i-simple-icons-google" />
        <span>Google</span>
      </Button>
      <Button :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']" icon="mdi:github" @click="signIn('github')">
        <div class="i-simple-icons-github" />
        <span>GitHub</span>
      </Button>
    </div>
    <div class="mt-8 text-xs text-gray-400">
      By continuing, you agree to our <a href="#" class="underline">Terms</a> and <a href="#" class="underline">Privacy Policy</a>.
    </div>
  </div>
</template>
