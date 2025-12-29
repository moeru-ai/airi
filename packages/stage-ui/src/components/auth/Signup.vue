<script lang="ts">
import { reactive, ref } from 'vue'

import { useAuth } from '../../composables/useAuth'

export default {
  setup() {
    const form = reactive({ name: '', email: '', password: '' })
    const error = ref<string | null>(null)
    const { signup, loading } = useAuth()

    const onSubmit = async () => {
      error.value = null
      try {
        await signup(form.name, form.email, form.password)
      } catch (err: any) {
        console.error('Signup failed:', err)
        error.value = err?.message || 'Signup failed'
      }
    }

    return { form, onSubmit, loading, error }
  },
}
</script>

<template>
  <div class="bg-card mx-auto max-w-md rounded-lg p-6 shadow-sm">
    <h2 class="mb-4 text-2xl font-medium">
      {{ $t('auth.signup.title') }}
    </h2>
    <form class="flex flex-col gap-3" @submit.prevent="onSubmit">
      <label class="flex flex-col">
        <span class="text-muted text-sm">{{ $t('auth.signup.name') }}</span>
        <input v-model="form.name" type="text" required class="input">
      </label>

      <label class="flex flex-col">
        <span class="text-muted text-sm">{{ $t('auth.signup.email') }}</span>
        <input v-model="form.email" type="email" required class="input">
      </label>

      <label class="flex flex-col">
        <span class="text-muted text-sm">{{ $t('auth.signup.password') }}</span>
        <input v-model="form.password" type="password" required class="input">
      </label>

      <button class="btn-primary" :disabled="loading">
        {{ $t('auth.signup.submit') }}
      </button>
      <div v-if="error" class="text-sm text-red-500 mt-2">{{ error }}</div>
    </form>
  </div>
</template>

<style scoped>
.input { padding: .6rem; border-radius: .5rem; border: 1px solid var(--border); }
.btn-primary { padding: .6rem; border-radius: .6rem; background: var(--primary); color: white; }
.bg-card { background: var(--card-bg); }
</style>
