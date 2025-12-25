<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { authClient, fetchSession } from '../../composables/auth'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const isLoading = ref(false)

function signIn(provider: 'google' | 'github') {
  isLoading.value = true
  authClient.signIn.social({
    provider,
    callbackURL: window.location.origin,
  }, {
    onSuccess: (ctx: any) => {
      const authToken = ctx.response.headers.get('set-auth-token') // get the token from the response headers
      if (authToken) {
        useAuthStore().authToken = authToken
      }
    },
    onError: (ctx: any) => {
      isLoading.value = false
      toast.error(ctx.error.message || 'Failed to sign in')
    },
  }).catch((error: any) => {
    isLoading.value = false
    toast.error(error instanceof Error ? error.message : 'An unknown error occurred')
  })
}

onMounted(() => {
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
  <div class="min-h-screen w-full flex items-center justify-center overflow-hidden bg-[#050505] text-white font-sans selection:bg-purple-500/30">
    <!-- Animated Background Elements -->
    <div class="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div class="animate-pulse-slow absolute left-[-10%] top-[-20%] h-[600px] w-[600px] rounded-full bg-purple-600/15 blur-[120px]" />
      <div class="animate-pulse-slow absolute bottom-[-20%] right-[-10%] h-[600px] w-[600px] rounded-full bg-blue-600/15 blur-[120px] delay-1000" />
      <div class="absolute left-[40%] top-[40%] h-[300px] w-[300px] rounded-full bg-pink-500/10 blur-[100px]" />
    </div>

    <!-- Grid Pattern Overlay -->
    <div class="[mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] absolute inset-0 z-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />

    <!-- Main Card -->
    <div class="relative z-10 max-w-md w-full p-6 sm:p-8">
      <div class="relative overflow-hidden border border-white/10 rounded-3xl bg-black/60 shadow-2xl backdrop-blur-2xl transition-all duration-500 hover:border-white/20 hover:shadow-2xl hover:shadow-purple-500/10">
        <!-- Shine effect -->
        <div class="pointer-events-none absolute inset-0 from-white/5 to-transparent bg-gradient-to-br" />

        <div class="relative flex flex-col items-center p-8">
          <!-- Logo / Icon -->
          <div class="group mb-8 h-20 w-20 flex items-center justify-center rounded-2xl bg-gradient-to-tr shadow-lg shadow-violet-500/25">
            <div class="i-solar-gamepad-bold text-4xl text-white transition-transform duration-300 group-hover:rotate-[-10deg] group-hover:scale-110" />
          </div>

          <h1 class="mb-3 text-3xl text-white font-bold tracking-tight sm:text-4xl">
            A I R I
          </h1>
          <p class="mb-10 text-center text-sm text-gray-400 leading-relaxed">
            Dive into the virtual dimension. <br>
            Connect with your favorite characters today.
          </p>

          <div class="w-full flex flex-col gap-4">
            <button
              class="group relative w-full flex items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5 text-black font-bold transition-all active:scale-[0.98] hover:scale-[1.02] disabled:cursor-not-allowed hover:bg-gray-100 disabled:opacity-70"
              :disabled="isLoading"
              @click="signIn('google')"
            >
              <div class="i-simple-icons-google text-xl transition-transform group-hover:scale-110" />
              <span>Sign in with Google</span>
            </button>

            <button
              class="group relative w-full flex items-center justify-center gap-3 border border-white/10 rounded-xl bg-white/5 px-4 py-3.5 text-white font-bold transition-all active:scale-[0.98] hover:scale-[1.02] disabled:cursor-not-allowed hover:bg-white/10 disabled:opacity-70"
              :disabled="isLoading"
              @click="signIn('github')"
            >
              <div class="i-simple-icons-github text-xl transition-transform group-hover:scale-110" />
              <span>Sign in with GitHub</span>
            </button>
          </div>

          <div class="mt-10 flex items-center justify-center gap-6 text-xs text-gray-500 font-medium">
            <a href="#" class="transition-colors hover:text-white">Terms</a>
            <span class="h-1 w-1 rounded-full bg-gray-700" />
            <a href="#" class="transition-colors hover:text-white">Privacy</a>
            <span class="h-1 w-1 rounded-full bg-gray-700" />
            <a href="#" class="transition-colors hover:text-white">Help</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-pulse-slow {
  animation: pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.5;
    transform: scale(1);
  }
  50% {
    opacity: 0.3;
    transform: scale(1.1);
  }
}
</style>

<route lang="yaml">
meta:
  layout: false
</route>
