<script setup lang="ts">
import { authClient, fetchSession } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Button } from '@proj-airi/ui'
import { useMediaQuery, useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

const router = useRouter()

const isDesktop = useMediaQuery('(min-width: 768px)')
const screenSafeArea = useScreenSafeArea()

useResizeObserver(document.documentElement, () => screenSafeArea.update())

function signIn(provider: 'google' | 'github') {
  authClient.signIn.social({
    provider,
    callbackURL: window.location.origin,
  }, {
    onSuccess: (ctx) => {
      const authToken = ctx.response.headers.get('set-auth-token') // get the token from the response headers
      if (authToken) {
        useAuthStore().authToken = authToken
      }
    },
  }).catch((error) => {
    toast.error(error instanceof Error ? error.message : 'An unknown error occurred')
  })
}

onMounted(() => {
  screenSafeArea.update()
  fetchSession()
    .then((authenticated) => {
      if (authenticated) {
        router.replace('/')
      }
    })
    .catch(() => {})
})
</script>

<template>
  <div v-if="isDesktop" class="min-h-screen flex flex-col items-center justify-center">
    <div class="mb-8 text-3xl font-bold">
      Sign in to AIRI Stage
    </div>
    <div class="max-w-xs w-full flex flex-col gap-3">
      <Button :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']" @click="signIn('google')">
        <div class="i-simple-icons-google" />
        <span>Google</span>
      </Button>
      <Button :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']" @click="signIn('github')">
        <div class="i-simple-icons-github" />
        <span>GitHub</span>
      </Button>
    </div>
    <div class="mt-8 text-xs text-gray-400">
      By continuing, you agree to our <a href="#" class="underline">Terms</a> and <a href="#" class="underline">Privacy Policy</a>.
    </div>
  </div>

  <div v-else class="min-h-screen flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-950">
    <div class="mb-12 flex flex-col items-center gap-4">
      <img src="../../assets/logo.svg" class="h-24 w-24 rounded-3xl shadow-lg">
      <div class="text-3xl font-bold">
        AIRI Stage
      </div>
    </div>

    <DrawerRoot :open="true" :dismissible="false">
      <DrawerPortal>
        <DrawerOverlay class="fixed inset-0 bg-black/40" />
        <DrawerContent
          class="fixed bottom-0 left-0 right-0 z-1000 flex flex-col rounded-t-3xl bg-white outline-none dark:bg-neutral-900"
          :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }"
        >
          <div class="px-6 pt-2">
            <DrawerHandle class="mb-6" />
            <div class="mb-6 text-2xl font-bold">
              Sign in
            </div>
            <div class="flex flex-col gap-4">
              <Button :class="['w-full', 'py-4', 'flex', 'items-center', 'justify-center', 'gap-3', 'text-lg', 'rounded-2xl']" @click="signIn('google')">
                <div class="i-simple-icons-google text-xl" />
                <span>Sign in with Google</span>
              </Button>
              <Button :class="['w-full', 'py-4', 'flex', 'items-center', 'justify-center', 'gap-3', 'text-lg', 'rounded-2xl']" @click="signIn('github')">
                <div class="i-simple-icons-github text-xl" />
                <span>Sign in with GitHub</span>
              </Button>
            </div>
            <div class="mt-10 pb-2 text-center text-xs text-gray-400">
              By continuing, you agree to our <a href="#" class="underline">Terms</a> and <a href="#" class="underline">Privacy Policy</a>.
            </div>
          </div>
        </DrawerContent>
      </DrawerPortal>
    </DrawerRoot>
  </div>
</template>
