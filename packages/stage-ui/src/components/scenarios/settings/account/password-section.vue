<script setup lang="ts">
import { Button, FieldInput } from '@proj-airi/ui'
import { ref } from 'vue'

import { useAccountManagement } from '../../../../composables/use-account-management'

const { changePassword, requestPasswordReset, hasCredential, loading, error } = useAccountManagement()

const currentPwd = ref('')
const newPwd = ref('')
const confirmPwd = ref('')

const resetLinkSent = ref(false)
const passwordChanged = ref(false)

const localError = ref<string | null>(null)

async function handleChangePassword() {
  localError.value = null
  passwordChanged.value = false

  if (newPwd.value !== confirmPwd.value) {
    localError.value = 'Passwords do not match'
    return
  }
  if (newPwd.value.length < 8) {
    localError.value = 'Password must be at least 8 characters'
    return
  }

  await changePassword(currentPwd.value, newPwd.value)

  if (!error.value) {
    passwordChanged.value = true
    currentPwd.value = ''
    newPwd.value = ''
    confirmPwd.value = ''
  }
}

async function handleRequestReset() {
  localError.value = null
  resetLinkSent.value = false

  await requestPasswordReset()

  if (!error.value) {
    resetLinkSent.value = true
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-6 p-8', 'rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm', 'bg-white dark:bg-neutral-900']">
    <template v-if="hasCredential">
      <div :class="['flex flex-col gap-6']">
        <div :class="['flex flex-col gap-1']">
          <h3 :class="['text-xl font-bold text-neutral-900 dark:text-white']">
            Change Password
          </h3>
          <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
            Update your password associated with this account.
          </p>
        </div>

        <form :class="['flex flex-col gap-5 mt-2']" @submit.prevent="handleChangePassword">
          <FieldInput
            v-model="currentPwd"
            type="password"
            label="Current Password"
            placeholder="Enter current password"
            required
          />
          <FieldInput
            v-model="newPwd"
            type="password"
            label="New Password"
            placeholder="Enter new password (min 8 characters)"
            required
          />
          <FieldInput
            v-model="confirmPwd"
            type="password"
            label="Confirm Password"
            placeholder="Confirm new password"
            required
          />

          <div v-if="error || localError" :class="['text-sm font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded-lg border border-red-100 dark:border-red-900/50']">
            {{ error || localError }}
          </div>
          <div v-if="passwordChanged" :class="['text-sm font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 p-3 rounded-lg border border-green-100 dark:border-green-900/50']">
            Password changed successfully.
          </div>

          <div :class="['flex justify-start mt-2']">
            <Button
              type="submit"
              variant="primary"
              :class="['rounded-xl px-6 py-2 shadow-sm font-medium']"
              :loading="loading"
              :disabled="!currentPwd || !newPwd || !confirmPwd"
            >
              Update Password
            </Button>
          </div>
        </form>

        <div :class="['mt-4 border-t border-neutral-100 dark:border-neutral-800/80 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4']">
          <div :class="['flex flex-col gap-1']">
            <span :class="['text-sm font-semibold text-neutral-900 dark:text-white']">Forgot your password?</span>
            <span :class="['text-sm text-neutral-500 dark:text-neutral-400']">
              Send a password reset link to your email.
            </span>
          </div>
          <div :class="['flex items-center gap-4']">
            <Button
              variant="secondary"
              size="sm"
              :class="['rounded-xl px-5 py-2 font-medium']"
              :loading="loading"
              @click="handleRequestReset"
            >
              Reset Password
            </Button>
            <span v-if="resetLinkSent" :class="['text-sm font-medium text-green-600 dark:text-green-400']">
              Link sent!
            </span>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div :class="['flex flex-col gap-5']">
        <div :class="['flex flex-col gap-1']">
          <h3 :class="['text-xl font-bold text-neutral-900 dark:text-white']">
            Set Password
          </h3>
          <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
            Set a password to enable email/password login and to be able to unlink social accounts.
          </p>
        </div>

        <div v-if="error" :class="['text-sm font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded-lg border border-red-100 dark:border-red-900/50']">
          {{ error }}
        </div>
        <div v-if="resetLinkSent" :class="['text-sm font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 p-3 rounded-lg border border-green-100 dark:border-green-900/50']">
          Password setup link sent to your email. Please check your inbox.
        </div>

        <div :class="['flex mt-2']">
          <Button
            variant="primary"
            :class="['rounded-xl px-6 py-2 shadow-sm font-medium']"
            :loading="loading"
            @click="handleRequestReset"
          >
            Send Setup Link
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>
