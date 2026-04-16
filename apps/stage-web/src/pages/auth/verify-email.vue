<script setup lang="ts">
import { useBreakpoints } from '@proj-airi/stage-ui/composables'
import { authClient } from '@proj-airi/stage-ui/libs/auth'
import { Button } from '@proj-airi/ui'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { isDesktop } = useBreakpoints()

const token = route.query.token as string | undefined

const status = ref<'loading' | 'success' | 'error'>('loading')

onMounted(async () => {
  if (!token) {
    status.value = 'error'
    return
  }

  try {
    const { error } = await authClient.verifyEmail({
      query: { token },
    })

    if (error) {
      throw error
    }

    status.value = 'success'
  }
  catch {
    status.value = 'error'
  }
})
</script>

<template>
  <div :class="['min-h-screen', 'flex', 'flex-col', 'items-center', 'justify-center', isDesktop ? 'font-cuteen' : 'bg-neutral-100 dark:bg-neutral-950']">
    <div v-if="!isDesktop" class="mb-12 flex flex-col items-center gap-4">
      <img src="../../assets/logo.svg" class="h-24 w-24 rounded-3xl shadow-lg">
      <div class="text-3xl font-bold">
        AIRI
      </div>
    </div>

    <div :class="[isDesktop ? 'max-w-xs' : 'max-w-sm', 'w-full', 'flex', 'flex-col', 'gap-4', 'items-center', !isDesktop && 'bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-sm']">
      <!-- Loading -->
      <template v-if="status === 'loading'">
        <div :class="['i-svg-spinners-ring-resize', 'text-4xl', 'text-neutral-400']" />
        <div :class="['text-center', 'text-lg', 'font-bold']">
          {{ t('server.auth.verifyEmail.loading') || 'Verifying your email...' }}
        </div>
      </template>

      <!-- Success -->
      <template v-else-if="status === 'success'">
        <div :class="['i-lucide-check-circle', 'text-4xl', 'text-green-500']" />
        <div :class="['text-center', isDesktop ? 'text-3xl font-bold' : 'text-2xl font-bold']">
          {{ t('server.auth.verifyEmail.success') || 'Email Verified!' }}
        </div>
        <div :class="['text-center', 'text-sm', 'text-neutral-500']">
          {{ t('server.auth.verifyEmail.successDescription') || 'Your email has been verified successfully.' }}
        </div>
        <Button
          :class="['w-full', 'py-2', 'mt-2']"
          @click="router.push('/')"
        >
          <span>{{ t('server.auth.verifyEmail.goHome') || 'Go to Home' }}</span>
        </Button>
      </template>

      <!-- Error -->
      <template v-else>
        <div :class="['i-lucide-x-circle', 'text-4xl', 'text-red-500']" />
        <div :class="['text-center', isDesktop ? 'text-3xl font-bold' : 'text-2xl font-bold']">
          {{ t('server.auth.verifyEmail.error') || 'Verification Failed' }}
        </div>
        <div :class="['text-center', 'text-sm', 'text-neutral-500']">
          {{ t('server.auth.verifyEmail.errorDescription') || 'The verification link is invalid or has expired.' }}
        </div>
        <Button
          :class="['w-full', 'py-2', 'mt-2']"
          @click="router.push('/auth/sign-in')"
        >
          <span>{{ t('server.auth.verifyEmail.backToSignIn') || 'Back to Sign In' }}</span>
        </Button>
      </template>
    </div>
  </div>
</template>
