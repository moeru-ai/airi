<script setup lang="ts">
import type { OAuthProvider } from '../../libs/auth'

import { Button } from '@proj-airi/ui'
import { useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

import { client } from '../../composables/api'
import { signIn } from '../../libs/auth'

const open = defineModel<boolean>('open', { required: true })

const screenSafeArea = useScreenSafeArea()
useResizeObserver(document.documentElement, () => screenSafeArea.update())

const loading = ref<Record<OAuthProvider, boolean>>({
  google: false,
  github: false,
})

const providerAvailability = ref<Record<OAuthProvider, boolean>>({
  google: true,
  github: true,
})

onMounted(async () => {
  try {
    const res = await client.api.auth.providers.$get()
    if (res.ok) {
      const providers = await res.json() as Array<{ id: OAuthProvider, available: boolean }>
      for (const provider of providers) {
        providerAvailability.value[provider.id] = provider.available
      }
    }
  }
  catch {
    // Default to true (assume available) if the API call fails
  }
})

async function handleSignIn(provider: OAuthProvider) {
  if (!providerAvailability.value[provider]) {
    return
  }
  loading.value[provider] = true
  try {
    await signIn(provider)
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'An unknown error occurred')
  }
  finally {
    loading.value[provider] = false
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
            Sign in
          </div>
          <div class="flex flex-col gap-4">
            <Button
              :class="['w-full', 'py-4', 'flex', 'items-center', 'justify-center', 'gap-3', 'text-lg', 'rounded-2xl', !providerAvailability.google && 'opacity-50']"
              icon="i-simple-icons-google"
              :loading="loading.google"
              :disabled="!providerAvailability.google"
              @click="handleSignIn('google')"
            >
              <span>{{ providerAvailability.google ? 'Sign in with Google' : 'Google (temporarily unavailable)' }}</span>
            </Button>
            <Button
              :class="['w-full', 'py-4', 'flex', 'items-center', 'justify-center', 'gap-3', 'text-lg', 'rounded-2xl', !providerAvailability.github && 'opacity-50']"
              icon="i-simple-icons-github"
              :loading="loading.github"
              :disabled="!providerAvailability.github"
              @click="handleSignIn('github')"
            >
              <span>{{ providerAvailability.github ? 'Sign in with GitHub' : 'GitHub (temporarily unavailable)' }}</span>
            </Button>
          </div>
          <div class="mt-10 pb-2 text-center text-xs text-gray-400">
            By continuing, you agree to our <a href="https://airi.moeru.ai/docs/en/about/terms" class="underline">Terms</a> and <a href="https://airi.moeru.ai/docs/en/about/privacy" class="underline">Privacy Policy</a>.
          </div>
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
