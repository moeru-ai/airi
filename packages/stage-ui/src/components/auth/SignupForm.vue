<template>
  <div class="max-w-md mx-auto p-6 rounded-lg bg-white/60 dark:bg-black/60 backdrop-blur-md">
    <h2 class="text-2xl font-semibold mb-4">Create account</h2>

    <form @submit.prevent="onSubmit" class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1">Full name</label>
        <input v-model="form.name" type="text" autocomplete="name" class="w-full px-3 py-2 rounded border" />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Email</label>
        <input v-model="form.email" type="email" autocomplete="email" class="w-full px-3 py-2 rounded border" />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Password</label>
        <input v-model="form.password" type="password" autocomplete="new-password" class="w-full px-3 py-2 rounded border" />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Confirm password</label>
        <input v-model="form.confirm" type="password" class="w-full px-3 py-2 rounded border" />
      </div>

      <div class="flex items-center gap-2 text-sm">
        <input type="checkbox" v-model="form.accept" />
        <label>I agree to the Terms of Service</label>
      </div>

      <div class="pt-2">
        <button type="submit" class="w-full btn-primary" :disabled="!canSubmit">Create account</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue'

const emit = defineEmits<{
  (e: 'submit', payload: { name: string; email: string; password: string }): void
}>()

const form = reactive({ name: '', email: '', password: '', confirm: '', accept: false })

const canSubmit = computed(() => form.name && form.email && form.password && form.password === form.confirm && form.accept)

function onSubmit() {
  if (!canSubmit.value) return
  emit('submit', { name: form.name, email: form.email, password: form.password })
}
</script>

<style scoped>
.btn-primary{background:var(--un-bg-primary, #2563eb);color:white;padding:.5rem;border-radius:.375rem}
</style>
