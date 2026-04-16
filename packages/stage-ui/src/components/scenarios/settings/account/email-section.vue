<script setup lang="ts">
import { Button, FieldInput } from '@proj-airi/ui'
import { ref } from 'vue'

import { useAccountManagement } from '../../../../composables/use-account-management'
import { useAuthStore } from '../../../../stores/auth'

const authStore = useAuthStore()
const { changeEmail, sendVerificationEmail, loading, error } = useAccountManagement()

const newEmailInput = ref('')
const lastSentEmail = ref('')
const verificationSent = ref(false)
const resendSuccess = ref(false)
const localError = ref<string | null>(null)

async function handleSendVerification() {
  localError.value = null
  resendSuccess.value = false
  verificationSent.value = false

  await sendVerificationEmail()

  if (!error.value) {
    resendSuccess.value = true
  }
}

async function handleChangeEmail() {
  localError.value = null
  verificationSent.value = false

  if (!newEmailInput.value || !newEmailInput.value.includes('@')) {
    localError.value = 'Please enter a valid email address'
    return
  }

  await changeEmail(newEmailInput.value)

  if (!error.value) {
    lastSentEmail.value = newEmailInput.value
    verificationSent.value = true
    newEmailInput.value = ''
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <div :class="['flex flex-col gap-4']">
      <div :class="['flex items-center justify-between']">
        <h3 :class="['text-lg font-semibold']">
          Email Address
        </h3>
      </div>

      <div :class="['flex flex-col gap-2 rounded-lg border p-4 dark:border-neutral-800']">
        <div :class="['text-sm font-medium text-neutral-600 dark:text-neutral-400']">
          Current Email
        </div>
        <div :class="['flex items-center justify-between']">
          <div :class="['text-base']">
            {{ authStore.user?.email || 'No email set' }}
          </div>
          <div :class="['flex items-center gap-2']">
            <Button
              v-if="authStore.user?.email && !authStore.user?.emailVerified"
              variant="secondary"
              size="sm"
              :loading="loading"
              @click="handleSendVerification"
            >
              Resend verification
            </Button>
            <div
              v-if="authStore.user?.emailVerified"
              :class="['rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200']"
            >
              Verified
            </div>
            <div
              v-else
              :class="['rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200']"
            >
              Not verified
            </div>
          </div>
        </div>
      </div>

      <form :class="['flex flex-col gap-4']" @submit.prevent="handleChangeEmail">
        <FieldInput
          v-model="newEmailInput"
          type="email"
          label="New Email"
          placeholder="Enter new email address"
          required
        />

        <div v-if="error || localError" :class="['text-sm text-red-500 dark:text-red-400']">
          {{ error || localError }}
        </div>
        <div v-if="verificationSent" :class="['text-sm text-green-500 dark:text-green-400']">
          Verification email sent to {{ lastSentEmail }}. Please check your inbox.
        </div>
        <div v-if="resendSuccess" :class="['text-sm text-green-500 dark:text-green-400']">
          Verification email resent. Please check your inbox.
        </div>

        <div :class="['flex justify-end']">
          <Button
            type="submit"
            variant="primary"
            :loading="loading"
            :disabled="!newEmailInput"
          >
            Change Email
          </Button>
        </div>
      </form>
    </div>
  </div>
</template>
