<template>
  <div class="max-w-md mx-auto p-6 rounded-lg bg-white/60 dark:bg-black/60 backdrop-blur-md">
    <h2 class="text-2xl font-semibold mb-4">Sign in</h2>

    <form @submit.prevent="onSubmit" class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1">Email or username</label>
        <input v-model="form.identifier" type="text" autocomplete="username" class="w-full px-3 py-2 rounded border" />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Password</label>
        <input v-model="form.password" type="password" autocomplete="current-password" class="w-full px-3 py-2 rounded border" />
      </div>

      <div class="flex items-center justify-between text-sm">
        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="form.remember" />
          <span>Remember me</span>
        </label>
        <a class="text-primary hover:underline">Forgot?</a>
      </div>

      <div class="pt-2">
        <button type="submit" class="w-full btn-primary">Sign in</button>
      </div>
    </form>

    <div class="mt-4 text-center text-sm text-muted">Or continue with</div>
    <div class="mt-3 grid grid-cols-2 gap-2">
      <button class="px-3 py-2 rounded border">Google</button>
      <button class="px-3 py-2 rounded border">Twitter</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'

const emit = defineEmits<{
  (e: 'submit', payload: { identifier: string; password: string; remember: boolean }): void
}>()

const form = reactive({ identifier: '', password: '', remember: false })

function onSubmit() {
  emit('submit', { ...form })
}
</script>

<style scoped>
.btn-primary{background:var(--un-bg-primary, #2563eb);color:white;padding:.5rem;border-radius:.375rem}
.text-primary{color:var(--un-text-primary,#2563eb)}
.text-muted{color:var(--un-text-muted,#6b7280)}
</style>
