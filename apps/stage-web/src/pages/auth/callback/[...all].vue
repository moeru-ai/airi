<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

import { authClient } from '../../../composables/auth'

const router = useRouter()

onMounted(async () => {
  const { data } = await authClient.getSession()
  if (data)
    router.replace('/')
  else
    router.replace('/auth/login')
})
</script>

<template>
  <div>
    <h1>Callback</h1>
  </div>

  <code>
    {{ $route.query }}
  </code>
</template>
