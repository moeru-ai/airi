<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { createAuthClient } from 'better-auth/client'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

const router = useRouter()

async function signIn() {
  const authClient = createAuthClient({
    baseURL: import.meta.env.VITE_SERVER_URL || 'http://localhost:3000',
  })

  const { error, data } = await authClient.signIn.social({
    provider: 'google',
    callbackURL: `${window.location.origin}/auth/callback/google`,
  })

  if (error) {
    toast.error(error?.message || 'An unknown error occurred')
  }

  if (data && data.redirect && data.url) {
    router.push(data.url)
  }
}
</script>

<template>
  <div>
    <h1>Login</h1>

    <Button @click="signIn">
      Sign In
    </Button>
  </div>
</template>
