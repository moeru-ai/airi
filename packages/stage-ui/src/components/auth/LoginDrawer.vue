<script setup lang="ts">
import type { OAuthProvider } from '../../libs/auth'

import { Button, FieldInput } from '@proj-airi/ui'
import { useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { authClient, fetchSession, signInOIDC } from '../../libs/auth'
import { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } from '../../libs/auth-config'
import { resolveAuthErrorMessage } from '../../libs/auth-errors'
import { defaultSignInProviders } from './providers'

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()

const screenSafeArea = useScreenSafeArea()
useResizeObserver(document.documentElement, () => screenSafeArea.update())

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
    toast.error(resolveAuthErrorMessage(error, t))
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
    window.location.href = '/'
  }
  catch (error) {
    toast.error(resolveAuthErrorMessage(error, t))
  }
  finally {
    emailLoading.value = false
  }
}
</script>

<template>
  <DrawerRoot v-model:open="open" should-scale-background>
    <DrawerPortal>
      <DrawerOverlay class="fixed inset-0 z-1000 bg-black/40" />
      <DrawerContent
        class="fixed bottom-0 left-0 right-0 z-1001 flex flex-col rounded-t-3xl bg-white outline-none dark:bg-neutral-900"
        :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }"
      >
        <div class="px-6 pt-2">
          <DrawerHandle class="mb-6" />
          <div class="mb-6 text-2xl font-bold">
            {{ signupSuccess ? (t('server.auth.signUp.verifyTitle') || 'Check your email') : mode === 'signin' ? (t('server.auth.signIn.title') || 'Sign In') : (t('server.auth.signUp.title') || 'Sign Up') }}
          </div>

          <template v-if="signupSuccess">
            <div :class="['flex', 'flex-col', 'items-center', 'gap-4', 'py-4']">
              <div :class="['i-lucide-mail-check', 'text-4xl', 'text-green-500']" />
              <div :class="['text-center', 'text-sm', 'text-neutral-500']">
                {{ t('server.auth.signUp.verifyDescription') || 'We sent a verification link to your email. Please verify your email before signing in.' }}
              </div>
              <Button
                :class="['w-full', 'py-4', 'text-lg', 'rounded-2xl']"
                @click="signupSuccess = false; mode = 'signin'"
              >
                <span>{{ t('server.auth.signUp.backToSignIn') || 'Back to Sign In' }}</span>
              </Button>
            </div>
          </template>

          <template v-else>
            <div class="flex flex-col gap-3">
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
                :class="['w-full', 'py-4', 'text-lg', 'rounded-2xl', 'mt-1']"
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

              <div :class="['flex', 'items-center', 'gap-3', 'my-4']">
                <div :class="['flex-1', 'h-px', 'bg-neutral-200', 'dark:bg-neutral-700']" />
                <span :class="['text-xs', 'text-neutral-400']">{{ t('server.auth.signIn.or') || 'or' }}</span>
                <div :class="['flex-1', 'h-px', 'bg-neutral-200', 'dark:bg-neutral-700']" />
              </div>

              <div class="flex flex-col gap-4">
                <Button
                  v-for="provider in defaultSignInProviders"
                  :key="provider.id"
                  :class="['w-full', 'py-4', 'flex', 'items-center', 'justify-center', 'gap-3', 'text-lg', 'rounded-2xl']"
                  :icon="provider.icon"
                  :loading="loading[provider.id]"
                  @click="handleSignIn(provider.id)"
                >
                  <span>{{ t('server.auth.signIn.withProvider', { provider: provider.name }) || `Sign in with ${provider.name}` }}</span>
                </Button>
              </div>

              <div :class="['text-center', 'text-sm', 'text-neutral-500', 'mt-1']">
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
            </div>
          </template>

          <div class="mt-6 pb-2 text-center text-xs text-gray-400">
            {{ t('server.auth.signIn.footer.prefix') || 'By continuing, you agree to our' }}
            <a href="https://airi.moeru.ai/docs/en/about/terms" class="underline">{{ t('server.auth.signIn.footer.terms') || 'Terms' }}</a>
            {{ t('server.auth.signIn.footer.and') || 'and' }}
            <a href="https://airi.moeru.ai/docs/en/about/privacy" class="underline">{{ t('server.auth.signIn.footer.privacy') || 'Privacy Policy' }}</a>.
          </div>
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
