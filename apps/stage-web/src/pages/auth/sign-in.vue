<script setup lang="ts">
import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { LoginDrawer } from '@proj-airi/stage-ui/components/auth'
import { useBreakpoints } from '@proj-airi/stage-ui/composables'
import { authClient, fetchSession, signInOIDC } from '@proj-airi/stage-ui/libs/auth'
import { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } from '@proj-airi/stage-ui/libs/auth-config'
import { Button, FieldInput } from '@proj-airi/ui'
import { onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

const router = useRouter()
const { t } = useI18n()

const { isDesktop } = useBreakpoints()

const loading = ref<Record<OAuthProvider, boolean>>({
  google: false,
  github: false,
})

const mode = ref<'signin' | 'signup'>('signin')
const form = reactive({
  name: '',
  email: '',
  password: '',
})
const emailLoading = ref(false)
const signupSuccess = ref(false)

async function handleSignIn(provider: OAuthProvider) {
  loading.value[provider] = true
  try {
    await signInOIDC({
      clientId: OIDC_CLIENT_ID,
      redirectUri: OIDC_REDIRECT_URI,
      provider,
    })
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('server.auth.signIn.error.unknown'))
  }
  finally {
    loading.value[provider] = false
  }
}

async function handleEmailAuth() {
  emailLoading.value = true
  try {
    if (mode.value === 'signup') {
      const { error } = await authClient.signUp.email({
        email: form.email,
        password: form.password,
        name: form.name,
      })
      if (error) {
        throw error
      }
      signupSuccess.value = true
      return
    }

    const { error } = await authClient.signIn.email({
      email: form.email,
      password: form.password,
    })
    if (error) {
      throw error
    }

    await fetchSession()
    router.replace('/')
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('server.auth.signIn.error.unknown') || 'An unknown error occurred')
  }
  finally {
    emailLoading.value = false
  }
}

onMounted(() => {
  // Check URL for error from failed OAuth callback
  const url = new URL(window.location.href)
  const error = url.searchParams.get('error')
  if (error) {
    toast.error(error === 'auth_failed' ? t('server.auth.signIn.error.authFailed') : error)
    url.searchParams.delete('error')
    window.history.replaceState(null, '', url.pathname)
  }

  fetchSession()
    .then((authenticated) => {
      if (authenticated || !isDesktop.value) {
        router.replace('/')
      }
    })
    .catch(() => {})
})

watch(isDesktop, (val) => {
  if (!val) {
    router.replace('/')
  }
})
</script>

<template>
  <div v-if="isDesktop" :class="['min-h-screen', 'flex', 'flex-col', 'items-center', 'justify-center', 'font-cuteen']">
    <div class="mb-8 text-3xl font-bold">
      {{ mode === 'signin' ? (t('server.auth.signIn.title') || 'Sign In') : (t('server.auth.signUp.title') || 'Sign Up') }}
    </div>
    <div :class="['max-w-xs', 'w-full', 'flex', 'flex-col', 'gap-3']">
      <template v-if="signupSuccess">
        <div :class="['i-lucide-mail-check', 'text-4xl', 'text-green-500', 'mx-auto']" />
        <div :class="['text-center', 'text-lg', 'font-semibold']">
          {{ t('server.auth.signUp.verifyTitle') || 'Check your email' }}
        </div>
        <div :class="['text-center', 'text-sm', 'text-neutral-500']">
          {{ t('server.auth.signUp.verifyDescription') || 'We sent a verification link to your email. Please verify your email before signing in.' }}
        </div>
        <Button
          :class="['w-full', 'py-2', 'mt-2']"
          @click="signupSuccess = false; mode = 'signin'"
        >
          <span>{{ t('server.auth.signUp.backToSignIn') || 'Back to Sign In' }}</span>
        </Button>
      </template>

      <template v-else>
        <Button
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        icon="i-simple-icons-google"
        :loading="loading.google"
        @click="handleSignIn('google')"
      >
        <span>Google</span>
      </Button>
      <Button
        :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']"
        icon="i-simple-icons-github"
        :loading="loading.github"
        @click="handleSignIn('github')"
      >
        <span>GitHub</span>
      </Button>

      <div :class="['flex', 'items-center', 'gap-3', 'my-2']">
        <div :class="['flex-1', 'h-px', 'bg-neutral-200', 'dark:bg-neutral-700']" />
        <span :class="['text-xs', 'text-neutral-400']">{{ t('server.auth.signIn.or') || 'or' }}</span>
        <div :class="['flex-1', 'h-px', 'bg-neutral-200', 'dark:bg-neutral-700']" />
      </div>

      <FieldInput
        v-if="mode === 'signup'"
        v-model="form.name"
        type="text"
        :placeholder="t('server.auth.signUp.name') || 'Name'"
        :disabled="emailLoading"
      />
      <FieldInput
        v-model="form.email"
        type="email"
        :placeholder="t('server.auth.signIn.email') || 'Email'"
        :disabled="emailLoading"
      />
      <FieldInput
        v-model="form.password"
        type="password"
        :placeholder="t('server.auth.signIn.password') || 'Password'"
        :disabled="emailLoading"
        @keydown.enter="handleEmailAuth"
      />

      <Button
        :class="['w-full', 'py-2', 'mt-1']"
        :loading="emailLoading"
        @click="handleEmailAuth"
      >
        <span>{{ mode === 'signin' ? (t('server.auth.signIn.submit') || 'Sign In') : (t('server.auth.signUp.submit') || 'Sign Up') }}</span>
      </Button>

      <div v-if="mode === 'signin'" :class="['text-center', 'mt-1']">
        <router-link
          to="/auth/forgot-password"
          :class="['text-xs', 'text-neutral-400', 'hover:text-neutral-600', 'dark:hover:text-neutral-300', 'underline']"
        >
          {{ t('server.auth.signIn.forgotPassword') || 'Forgot Password?' }}
        </router-link>
      </div>

      <div :class="['text-center', 'text-sm', 'text-neutral-500', 'mt-2']">
        <template v-if="mode === 'signin'">
          {{ t('server.auth.signIn.noAccount') || "Don't have an account?" }}
          <button
            :class="['underline', 'text-neutral-600', 'dark:text-neutral-300', 'cursor-pointer']"
            @click="mode = 'signup'"
          >
            {{ t('server.auth.signIn.switchToSignUp') || 'Sign Up' }}
          </button>
        </template>
        <template v-else>
          {{ t('server.auth.signUp.hasAccount') || 'Already have an account?' }}
          <button
            :class="['underline', 'text-neutral-600', 'dark:text-neutral-300', 'cursor-pointer']"
            @click="mode = 'signin'"
          >
            {{ t('server.auth.signUp.switchToSignIn') || 'Sign In' }}
          </button>
        </template>
      </div>
      </template>
    </div>
    <div class="mt-8 text-xs text-gray-400">
      {{ t('server.auth.signIn.footer.prefix') }}
      <a href="https://airi.moeru.ai/docs/en/about/terms" class="underline">{{ t('server.auth.signIn.footer.terms') }}</a>
      {{ t('server.auth.signIn.footer.and') }}
      <a href="https://airi.moeru.ai/docs/en/about/privacy" class="underline">{{ t('server.auth.signIn.footer.privacy') }}</a>.
    </div>
  </div>

  <div v-else :class="['min-h-screen', 'flex', 'flex-col', 'items-center', 'justify-center', 'bg-neutral-100', 'dark:bg-neutral-950']">
    <div class="mb-12 flex flex-col items-center gap-4">
      <img src="../../assets/logo.svg" class="h-24 w-24 rounded-3xl shadow-lg">
      <div class="text-3xl font-bold">
        AIRI
      </div>
    </div>

    <LoginDrawer :open="true" />
  </div>
</template>
