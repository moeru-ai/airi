<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { reactive } from 'vue'

const emit = defineEmits<{
  (e: 'submit', payload: { identifier: string, password: string, remember: boolean }): void
  (e: 'google'): void
  (e: 'twitter'): void
  (e: 'forgot'): void
}>()

const uid = Math.random().toString(36).slice(2, 9)
const identifierId = `identifier-${uid}`
const passwordId = `password-${uid}`

const form = reactive({ identifier: '', password: '', remember: false })

function onSubmit() {
  emit('submit', { ...form })
}
</script>

<template>
  <div class="mx-auto max-w-md rounded-lg bg-white/60 p-6 backdrop-blur-md dark:bg-black/60">
    <h2 class="mb-4 text-2xl font-semibold">
      Sign in
    </h2>

    <form class="space-y-4" @submit.prevent="onSubmit">
      <div>
        <label :for="identifierId" class="mb-1 block text-sm font-medium">Email or username</label>
        <input :id="identifierId" v-model="form.identifier" type="text" autocomplete="username" class="w-full border rounded px-3 py-2">
      </div>

      <div>
        <label :for="passwordId" class="mb-1 block text-sm font-medium">Password</label>
        <input :id="passwordId" v-model="form.password" type="password" autocomplete="current-password" class="w-full border rounded px-3 py-2">
      </div>

      <div class="flex items-center justify-between text-sm">
        <label class="flex items-center gap-2">
          <input v-model="form.remember" type="checkbox">
          <span>Remember me</span>
        </label>
        <a href="#" class="text-primary hover:underline" @click.prevent="$emit('forgot')">Forgot?</a>
      </div>

      <div class="pt-2">
        <Button label="Sign in" type="submit" block />
      </div>
    </form>

    <div class="text-muted mt-4 text-center text-sm">
      Or continue with
    </div>
    <div class="grid grid-cols-2 mt-3 gap-2">
      <Button label="Google" @click="$emit('google')" />
      <Button label="Twitter" @click="$emit('twitter')" />
    </div>
  </div>
</template>

<style scoped>
.text-primary{color:var(--un-text-primary,#2563eb)}
.text-muted{color:var(--un-text-muted,#6b7280)}
</style>
