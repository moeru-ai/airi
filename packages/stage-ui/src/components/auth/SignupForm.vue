<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { computed, reactive } from 'vue'

const emit = defineEmits<{
  (e: 'submit', payload: { name: string, email: string, password: string }): void
}>()

const uid = Math.random().toString(36).slice(2, 9)
const nameId = `name-${uid}`
const emailId = `email-${uid}`
const passwordId = `password-${uid}`
const confirmId = `confirm-${uid}`

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
        <label :for="nameId" class="mb-1 block text-sm font-medium">Full name</label>
        <input :id="nameId" v-model="form.name" type="text" autocomplete="name" class="w-full border rounded px-3 py-2">
      </div>

      <div>
        <label :for="emailId" class="mb-1 block text-sm font-medium">Email</label>
        <input :id="emailId" v-model="form.email" type="email" autocomplete="email" class="w-full border rounded px-3 py-2">
      </div>

      <div>
        <label :for="passwordId" class="mb-1 block text-sm font-medium">Password</label>
        <input :id="passwordId" v-model="form.password" type="password" autocomplete="new-password" class="w-full border rounded px-3 py-2">
      </div>

      <div>
        <label :for="confirmId" class="mb-1 block text-sm font-medium">Confirm password</label>
        <input :id="confirmId" v-model="form.confirm" type="password" class="w-full border rounded px-3 py-2">
      </div>

      <label class="flex items-center gap-2 text-sm">
        <input v-model="form.accept" type="checkbox">
        <span>I agree to the <a href="/terms" target="_blank" rel="noopener" class="text-primary hover:underline">Terms of Service</a></span>
      </label>

      <div class="pt-2">
        <Button label="Create account" type="submit" block :disabled="!canSubmit" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.text-primary{color:var(--un-text-primary,#2563eb)}
.text-muted{color:var(--un-text-muted,#6b7280)}
</style>
