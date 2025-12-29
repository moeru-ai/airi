<script setup lang="ts">
import { computed, reactive } from 'vue'

const emit = defineEmits<{
  (e: 'submit', payload: { name: string, email: string, password: string }): void
}>()

const form = reactive({ name: '', email: '', password: '', confirm: '', accept: false })

const canSubmit = computed(() => form.name && form.email && form.password && form.password === form.confirm && form.accept)

function onSubmit() {
  if (!canSubmit.value)
    return
  emit('submit', { name: form.name, email: form.email, password: form.password })
}
</script>

<template>
  <div class="mx-auto max-w-md rounded-lg bg-white/60 p-6 backdrop-blur-md dark:bg-black/60">
    <h2 class="mb-4 text-2xl font-semibold">
      Create account
    </h2>

    <form class="space-y-4" @submit.prevent="onSubmit">
      <div>
        <label class="mb-1 block text-sm font-medium">Full name</label>
        <input v-model="form.name" type="text" autocomplete="name" class="w-full border rounded px-3 py-2">
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium">Email</label>
        <input v-model="form.email" type="email" autocomplete="email" class="w-full border rounded px-3 py-2">
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium">Password</label>
        <input v-model="form.password" type="password" autocomplete="new-password" class="w-full border rounded px-3 py-2">
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium">Confirm password</label>
        <input v-model="form.confirm" type="password" class="w-full border rounded px-3 py-2">
      </div>

      <div class="flex items-center gap-2 text-sm">
        <input v-model="form.accept" type="checkbox">
        <label>I agree to the Terms of Service</label>
      </div>

      <div class="pt-2">
        <button type="submit" class="btn-primary w-full" :disabled="!canSubmit">
          Create account
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.btn-primary{background:var(--un-bg-primary, #2563eb);color:white;padding:.5rem;border-radius:.375rem}
</style>
