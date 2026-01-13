<script setup lang="ts">
import { LoginDrawer } from '@proj-airi/stage-ui/components/auth'
import { fetchSession, signIn } from '@proj-airi/stage-ui/libs/auth'
import { Button } from '@proj-airi/ui'
import { useMediaQuery } from '@vueuse/core'
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

const router = useRouter()

const isDesktop = useMediaQuery('(min-width: 768px)')

async function handleSignIn(provider: 'google' | 'github') {
  try {
    await signIn(provider)
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'An unknown error occurred')
  }
}

onMounted(() => {
  fetchSession()
    .then((authenticated) => {
      if (authenticated) {
        router.replace('/')
      }
      else if (!isDesktop.value) {
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
  <div v-if="isDesktop" class="min-h-screen flex flex-col items-center justify-center">
    <div class="mb-8 text-3xl font-bold">
      Sign in to AIRI Stage
    </div>
    <div class="max-w-xs w-full flex flex-col gap-3">
      <Button :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']" @click="handleSignIn('google')">
        <div class="i-simple-icons-google" />
        <span>Google</span>
      </Button>
      <Button :class="['w-full', 'py-2', 'flex', 'items-center', 'justify-center']" @click="handleSignIn('github')">
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

    <LoginDrawer :open="true" />
  </div>
</template>
