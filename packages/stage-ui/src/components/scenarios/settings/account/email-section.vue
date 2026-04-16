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
  <div :class="['flex flex-col gap-6 p-8', 'rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm', 'bg-white dark:bg-neutral-900']">
    <div :class="['flex flex-col gap-6']">
      <div :class="['flex flex-col gap-1']">
        <h3 :class="['text-xl font-bold text-neutral-900 dark:text-white']">
          Email Address
        </h3>
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          Manage the email address associated with your account.
        </p>
      </div>

      <div :class="['flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4', 'rounded-xl border border-neutral-200 dark:border-neutral-800', 'bg-neutral-50/50 dark:bg-neutral-800/20 p-5 mt-2']">
        <div :class="['flex flex-col gap-1']">
          <div :class="['text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400']">
            Current Email
          </div>
          <div :class="['text-base font-medium text-neutral-900 dark:text-white']">
            {{ authStore.user?.email || 'No email set' }}
          </div>
        </div>
        <div :class="['flex items-center gap-3']">
          <div
            v-if="authStore.user?.emailVerified"
            :class="['flex items-center gap-1.5', 'rounded-lg bg-green-100/80 px-3 py-1 text-sm font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-200 dark:border-green-800/50 shadow-sm']"
          >
            <div :class="['i-solar:check-circle-bold', 'size-4']" />
            Verified
          </div>
          <template v-else-if="authStore.user?.email">
            <div
              :class="['flex items-center gap-1.5', 'rounded-lg bg-yellow-100/80 px-3 py-1 text-sm font-semibold text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800/50 shadow-sm']"
            >
              <div :class="['i-solar:info-circle-bold', 'size-4']" />
              Not verified
            </div>
            <Button
              variant="secondary"
              size="sm"
              :class="['rounded-lg font-medium']"
              :loading="loading"
              @click="handleSendVerification"
            >
              Resend email
            </Button>
          </template>
        </div>
      </div>

      <form :class="['flex flex-col gap-5 mt-2']" @submit.prevent="handleChangeEmail">
        <FieldInput
          v-model="newEmailInput"
          type="email"
          label="New Email"
          placeholder="Enter new email address"
          required
        />

        <div v-if="error || localError" :class="['text-sm font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded-lg border border-red-100 dark:border-red-900/50']">
          {{ error || localError }}
        </div>
        <div v-if="verificationSent" :class="['text-sm font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 p-3 rounded-lg border border-green-100 dark:border-green-900/50']">
          Verification email sent to <span class="font-bold">{{ lastSentEmail }}</span>. Please check your inbox.
        </div>
        <div v-if="resendSuccess" :class="['text-sm font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 p-3 rounded-lg border border-green-100 dark:border-green-900/50']">
          Verification email resent. Please check your inbox.
        </div>

        <div :class="['flex justify-start mt-2']">
          <Button
            type="submit"
            variant="primary"
            :class="['rounded-xl px-6 py-2 shadow-sm font-medium']"
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
