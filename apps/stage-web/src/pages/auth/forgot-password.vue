<script setup lang="ts">
import { useBreakpoints } from '@proj-airi/stage-ui/composables'
import { authClient } from '@proj-airi/stage-ui/libs/auth'
import { Button, FieldInput } from '@proj-airi/ui'
import { useIntervalFn } from '@vueuse/core'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

const { t } = useI18n()
const { isDesktop } = useBreakpoints()

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const countdown = ref(0)

const { pause, resume } = useIntervalFn(() => {
  if (countdown.value > 0) {
    countdown.value--
  }
  else {
    pause()
  }
}, 1000, { immediate: false })

async function handleSendResetLink() {
  if (!email.value) {
    toast.error(t('server.auth.forgotPassword.error.emptyEmail') || 'Please enter your email address')
    return
  }

  loading.value = true
  try {
    const { error } = await authClient.requestPasswordReset({
      email: email.value,
    })

    if (error) {
      throw error
    }
  }
  catch {
    // NOTICE: We intentionally swallow errors here to avoid leaking
    // whether an email exists in the system. The generic success message
    // is shown regardless.
  }
  finally {
    loading.value = false
    sent.value = true
    countdown.value = 60
    resume()
  }
}
</script>

<template>
  <div :class="['min-h-screen', 'flex', 'flex-col', 'items-center', 'justify-center', isDesktop ? 'font-cuteen' : 'bg-neutral-100 dark:bg-neutral-950']">
    <div v-if="!isDesktop" class="mb-12 flex flex-col items-center gap-4">
      <img src="../../assets/logo.svg" class="h-24 w-24 rounded-3xl shadow-lg">
      <div class="text-3xl font-bold">
        AIRI
      </div>
    </div>

    <div :class="[isDesktop ? 'max-w-xs' : 'max-w-sm', 'w-full', 'flex', 'flex-col', 'gap-4', !isDesktop && 'bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-sm']">
      <div :class="['text-center', isDesktop ? 'mb-4 text-3xl font-bold' : 'mb-2 text-2xl font-bold']">
        {{ t('server.auth.forgotPassword.title') || 'Forgot Password' }}
      </div>

      <template v-if="!sent">
        <div :class="['text-center', 'text-sm', 'text-neutral-500']">
          {{ t('server.auth.forgotPassword.description') || 'Enter your email and we\'ll send you a reset link.' }}
        </div>
        <FieldInput
          v-model="email"
          type="email"
          :placeholder="t('server.auth.forgotPassword.email') || 'Email'"
          :disabled="loading"
          @keydown.enter="handleSendResetLink"
        />
        <Button
          :class="['w-full', 'py-2', 'mt-2']"
          :loading="loading"
          @click="handleSendResetLink"
        >
          <span>{{ t('server.auth.forgotPassword.submit') || 'Send Reset Link' }}</span>
        </Button>
      </template>

      <template v-else>
        <div :class="['text-center', 'text-sm', 'text-neutral-500']">
          {{ t('server.auth.forgotPassword.sent') || 'If an account with that email exists, a reset link has been sent.' }}
        </div>
        <Button
          :class="['w-full', 'py-2', 'mt-2']"
          :disabled="countdown > 0"
          :loading="loading"
          @click="handleSendResetLink"
        >
          <span>
            {{ countdown > 0
              ? `${t('server.auth.forgotPassword.resend') || 'Resend'} (${countdown}s)`
              : (t('server.auth.forgotPassword.resend') || 'Resend')
            }}
          </span>
        </Button>
      </template>

      <div :class="['text-center', 'mt-2']">
        <router-link
          to="/auth/sign-in"
          :class="['text-sm', 'text-neutral-400', 'hover:text-neutral-600', 'dark:hover:text-neutral-300', 'underline']"
        >
          {{ t('server.auth.forgotPassword.backToSignIn') || 'Back to Sign In' }}
        </router-link>
      </div>
    </div>
  </div>
</template>
