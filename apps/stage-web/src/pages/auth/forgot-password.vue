<script setup lang="ts">
import { authClient } from '@proj-airi/stage-ui/libs/auth'
import { Button, FieldInput } from '@proj-airi/ui'
import { useIntervalFn } from '@vueuse/core'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

const { t } = useI18n()

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
    toast.error(t('server.auth.forgotPassword.error.emptyEmail'))
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
  <!--
    Use UnoCSS responsive classes (`md:` = `min-width: 768px`, matching the
    `useBreakpoints().isDesktop` query) so the layout renders correctly during
    SSR/first paint without waiting for `useMediaQuery` to resolve client-side.
  -->
  <div :class="[
    'min-h-screen flex flex-col items-center justify-center',
    'bg-neutral-100 dark:bg-neutral-950',
    'md:bg-transparent md:dark:bg-transparent md:font-cuteen',
  ]">
    <div :class="['mb-12 flex flex-col items-center gap-4', 'md:hidden']">
      <img src="../../assets/logo.svg" class="h-24 w-24 rounded-3xl shadow-lg">
      <div class="text-3xl font-bold">
        AIRI
      </div>
    </div>

    <div :class="[
      'w-full flex flex-col gap-4',
      'max-w-sm bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-sm',
      'md:max-w-xs md:bg-transparent md:dark:bg-transparent md:p-0 md:rounded-none md:shadow-none',
    ]">
      <div :class="['text-center font-bold', 'mb-2 text-2xl', 'md:mb-4 md:text-3xl']">
        {{ t('server.auth.forgotPassword.title') }}
      </div>

      <template v-if="!sent">
        <div :class="['text-center', 'text-sm', 'text-neutral-500']">
          {{ t('server.auth.forgotPassword.description') }}
        </div>
        <FieldInput
          v-model="email"
          type="email"
          :placeholder="t('server.auth.forgotPassword.email')"
          :disabled="loading"
          @keydown.enter="handleSendResetLink"
        />
        <Button
          :class="['w-full', 'py-2', 'mt-2']"
          :loading="loading"
          @click="handleSendResetLink"
        >
          <span>{{ t('server.auth.forgotPassword.submit') }}</span>
        </Button>
      </template>

      <template v-else>
        <div :class="['text-center', 'text-sm', 'text-neutral-500']">
          {{ t('server.auth.forgotPassword.sent') }}
        </div>
        <Button
          :class="['w-full', 'py-2', 'mt-2']"
          :disabled="countdown > 0"
          :loading="loading"
          @click="handleSendResetLink"
        >
          <span>
            {{ countdown > 0
              ? `${t('server.auth.forgotPassword.resend')} (${countdown}s)`
              : t('server.auth.forgotPassword.resend')
            }}
          </span>
        </Button>
      </template>

      <div :class="['text-center', 'mt-2']">
        <router-link
          to="/auth/sign-in"
          :class="['text-sm', 'text-neutral-400', 'hover:text-neutral-600', 'dark:hover:text-neutral-300', 'underline']"
        >
          {{ t('server.auth.forgotPassword.backToSignIn') }}
        </router-link>
      </div>
    </div>
  </div>
</template>
