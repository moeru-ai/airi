<template>
  <div class="max-w-md mx-auto p-6 bg-card rounded-lg shadow-sm">
    <h2 class="text-2xl font-medium mb-4">{{ $t('auth.login.title') }}</h2>
    <form @submit.prevent="onSubmit" class="flex flex-col gap-3">
      <label class="flex flex-col">
        <span class="text-sm text-muted">{{ $t('auth.login.email') }}</span>
        <input v-model="form.email" type="email" required class="input" />
      </label>

      <label class="flex flex-col">
        <span class="text-sm text-muted">{{ $t('auth.login.password') }}</span>
        <input v-model="form.password" type="password" required class="input" />
      </label>

      <button class="btn-primary" :disabled="loading">
        {{ $t('auth.login.submit') }}
      </button>
    </form>
  </div>
</template>

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
  }
}
</script>

<style scoped>
.input { padding: .6rem; border-radius: .5rem; border: 1px solid var(--border); }
.btn-primary { padding: .6rem; border-radius: .6rem; background: var(--primary); color: white; }
.bg-card { background: var(--card-bg); }
</style>
