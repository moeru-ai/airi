<script lang="ts">
import { reactive } from 'vue'

import { useAuth } from '../../composables/useAuth'

export default {
  setup() {
    const form = reactive({ email: '', password: '' })
    const { login, loading } = useAuth()

    const onSubmit = async () => {
      await login(form.email, form.password)
    }

    return { form, onSubmit, loading }
  },
}
</script>

<template>
  <div class="bg-card mx-auto max-w-md rounded-lg p-6 shadow-sm">
    <h2 class="mb-4 text-2xl font-medium">
      {{ $t('auth.login.title') }}
    </h2>
    <form class="flex flex-col gap-3" @submit.prevent="onSubmit">
      <label class="flex flex-col">
        <span class="text-muted text-sm">{{ $t('auth.login.email') }}</span>
        <input v-model="form.email" type="email" required class="input">
      </label>

      <label class="flex flex-col">
        <span class="text-muted text-sm">{{ $t('auth.login.password') }}</span>
        <input v-model="form.password" type="password" required class="input">
      </label>

      <button class="btn-primary" :disabled="loading">
        {{ $t('auth.login.submit') }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.input { padding: .6rem; border-radius: .5rem; border: 1px solid var(--border); }
.btn-primary { padding: .6rem; border-radius: .6rem; background: var(--primary); color: white; }
.bg-card { background: var(--card-bg); }
</style>
