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
  <div :class="['flex flex-col gap-6']">
    <template v-if="hasCredential">
      <div :class="['flex flex-col gap-4']">
        <h3 :class="['text-lg font-semibold']">
          Change Password
        </h3>

        <form :class="['flex flex-col gap-4']" @submit.prevent="handleChangePassword">
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

          <div v-if="error || localError" :class="['text-sm text-red-500 dark:text-red-400']">
            {{ error || localError }}
          </div>
          <div v-if="passwordChanged" :class="['text-sm text-green-500 dark:text-green-400']">
            Password changed successfully.
          </div>

          <div :class="['flex justify-end']">
            <Button
              type="submit"
              variant="primary"
              :loading="loading"
              :disabled="!currentPwd || !newPwd || !confirmPwd"
            >
              Change Password
            </Button>
          </div>
        </form>

        <div :class="['mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800']">
          <p :class="['mb-2 text-sm text-neutral-600 dark:text-neutral-400']">
            Forgot your current password?
          </p>
          <div :class="['flex items-center gap-4']">
            <Button
              variant="secondary"
              size="sm"
              :loading="loading"
              @click="handleRequestReset"
            >
              Send Password Reset Link
            </Button>
            <span v-if="resetLinkSent" :class="['text-sm text-green-500 dark:text-green-400']">
              Link sent to your email.
            </span>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div :class="['flex flex-col gap-4']">
        <h3 :class="['text-lg font-semibold']">
          Set Password
        </h3>
        <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
          Set a password to enable email/password login and to be able to unlink OAuth providers.
        </p>

        <div v-if="error" :class="['text-sm text-red-500 dark:text-red-400']">
          {{ error }}
        </div>
        <div v-if="resetLinkSent" :class="['text-sm text-green-500 dark:text-green-400']">
          Password setup link sent to your email.
        </div>

        <div :class="['flex']">
          <Button
            variant="primary"
            :loading="loading"
            @click="handleRequestReset"
          >
            Send Password Setup Link
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>
