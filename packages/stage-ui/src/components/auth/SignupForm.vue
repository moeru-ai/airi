<template>
  <div class="max-w-md mx-auto p-6 rounded-lg bg-white/60 dark:bg-black/60 backdrop-blur-md">
    <h2 class="text-2xl font-semibold mb-4">Create account</h2>

    <form @submit.prevent="onSubmit" class="space-y-4">
      <div>
        <label :for="nameId" class="block text-sm font-medium mb-1">Full name</label>
        <input v-model="form.name" :id="nameId" type="text" autocomplete="name" class="w-full px-3 py-2 rounded border" />
      </div>

      <div>
        <label :for="emailId" class="block text-sm font-medium mb-1">Email</label>
        <input v-model="form.email" :id="emailId" type="email" autocomplete="email" class="w-full px-3 py-2 rounded border" />
      </div>

      <div>
        <label :for="passwordId" class="block text-sm font-medium mb-1">Password</label>
        <input v-model="form.password" :id="passwordId" type="password" autocomplete="new-password" class="w-full px-3 py-2 rounded border" />
      </div>

      <div>
        <label :for="confirmId" class="block text-sm font-medium mb-1">Confirm password</label>
        <input v-model="form.confirm" :id="confirmId" type="password" class="w-full px-3 py-2 rounded border" />
      </div>

      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" v-model="form.accept" />
        <span>I agree to the <a href="/terms" target="_blank" rel="noopener" class="text-primary hover:underline">Terms of Service</a></span>
      </label>

      <div class="pt-2">
        <Button label="Create account" type="submit" block :disabled="!canSubmit" />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue'
import { Button } from '@proj-airi/ui'

const emit = defineEmits<{
  (e: 'submit', payload: { name: string; email: string; password: string }): void
}>()

const uid = Math.random().toString(36).slice(2, 9)
const nameId = `name-${uid}`
const emailId = `email-${uid}`
const passwordId = `password-${uid}`
const confirmId = `confirm-${uid}`

const form = reactive({ name: '', email: '', password: '', confirm: '', accept: false })

const canSubmit = computed(() => form.name && form.email && form.password && form.password === form.confirm && form.accept)

function onSubmit() {
  if (!canSubmit.value) return
  emit('submit', { name: form.name, email: form.email, password: form.password })
}
</script>
