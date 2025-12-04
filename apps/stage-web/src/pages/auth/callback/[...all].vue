<script setup lang="ts">
import { createAuthClient } from 'better-auth/client'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'

const route = useRoute()
const response = ref()

onMounted(async () => {
  const authClient = createAuthClient({
    baseURL: import.meta.env.VITE_SERVER_URL || 'http://localhost:3000',
  })

  const { error, data } = await authClient.signIn.social({
    provider: 'google',
    idToken: {
      token: route.query.state,
      accessToken: route.query.code,
    },
  })

  if (error) {
    toast.error(error?.message || 'An unknown error occurred')
  }

  response.value = data
})
</script>

<template>
  <div>
    <h1>Callback</h1>
  </div>

  <code>
    {{ $route.query }}
  </code>

  <code>
    {{ route.query.state }}
  </code>

  <code>
    {{ route.query.code }}
  </code>

  <code>
    {{ response }}
  </code>
</template>
