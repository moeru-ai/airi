<script setup lang="ts">
import { authClient } from '@proj-airi/stage-ui/libs/auth'
import { Button, FieldInput } from '@proj-airi/ui'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const token = route.query.token as string | undefined

const hasValidToken = ref(true)
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)

onMounted(() => {
  if (!token) {
    hasValidToken.value = false
  }
})

async function handleResetPassword() {
  if (!token)
    return

  if (newPassword.value.length < 8) {
    toast.error(t('server.auth.resetPassword.error.tooShort'))
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    toast.error(t('server.auth.resetPassword.error.mismatch'))
    return
  }

  loading.value = true
  try {
    const { error } = await authClient.resetPassword({
      newPassword: newPassword.value,
      token,
    })

    if (error) {
      throw error
    }

    toast.success(t('server.auth.resetPassword.success'))
    router.push('/auth/sign-in?reset_success=1')
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('server.auth.resetPassword.error.unknown'))
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <!--
    UnoCSS responsive (`md:` = `min-width: 768px`, the same query as
    `useBreakpoints().isDesktop`) so the layout matches first paint without
    waiting for `useMediaQuery` to settle on the client.
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
        {{ t('server.auth.resetPassword.title') }}
      </div>

      <template v-if="!hasValidToken">
        <div class="text-center text-red-500">
          {{ t('server.auth.resetPassword.invalidToken') }}
        </div>
        <Button
          :class="['w-full', 'py-2']"
          @click="router.push('/auth/forgot-password')"
        >
          <span>{{ t('server.auth.resetPassword.backToForgot') }}</span>
        </Button>
      </template>

      <template v-else>
        <FieldInput
          v-model="newPassword"
          type="password"
          :placeholder="t('server.auth.resetPassword.newPassword')"
          :disabled="loading"
        />
        <FieldInput
          v-model="confirmPassword"
          type="password"
          :placeholder="t('server.auth.resetPassword.confirmPassword')"
          :disabled="loading"
          @keydown.enter="handleResetPassword"
        />
        <Button
          :class="['w-full', 'py-2', 'mt-2']"
          :loading="loading"
          @click="handleResetPassword"
        >
          <span>{{ t('server.auth.resetPassword.submit') }}</span>
        </Button>
      </template>
    </div>
  </div>
</template>
