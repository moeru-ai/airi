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
  <div>

    <div class="flex flex-row gap-2">
      <Button @click="signIn('google')">
        Sign In with Google
      </Button>

      <Button @click="signIn('github')">
        Sign In with GitHub
      </Button>
    </div>
  </div>
</template>
