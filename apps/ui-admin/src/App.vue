<script setup lang="ts">
import type { AdminMe } from './modules/api'

import { errorMessageFromUnknown } from '@proj-airi/stage-shared'
import { computed, onMounted, shallowRef } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { Toaster } from 'vue-sonner'

import { adminApi, AdminApiError, signInUrl } from './modules/api'

const route = useRoute()

const loading = shallowRef(true)
const me = shallowRef<AdminMe | null>(null)
const accessError = shallowRef<string | null>(null)

const navItems = [
  { to: '/', icon: 'i-lucide-layout-dashboard', label: 'Overview' },
  { to: '/users', icon: 'i-lucide-users', label: 'Users' },
  { to: '/flux', icon: 'i-lucide-coins', label: 'Flux' },
  { to: '/llm-router', icon: 'i-lucide-route', label: 'LLM Router' },
  { to: '/voice-packs', icon: 'i-lucide-volume-2', label: 'Voice Packs' },
]

const activeNavItem = computed(() => navItems.find(item =>
  item.to === '/'
    ? route.path === '/'
    : route.path === item.to || route.path.startsWith(`${item.to}/`),
))
const currentTitle = computed(() => activeNavItem.value?.label ?? 'Overview')
const initials = computed(() => {
  const source = me.value?.user.name || me.value?.user.email || 'A'
  return source.slice(0, 1).toUpperCase()
})

onMounted(async () => {
  try {
    me.value = await adminApi.me()
  }
  catch (error) {
    if (error instanceof AdminApiError && error.status === 401) {
      window.location.href = signInUrl()
      return
    }

    accessError.value = errorMessageFromUnknown(error, 'Admin access required')
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-[#f7f8fa] text-[#171717]">
    <div v-if="loading" class="grid min-h-screen place-items-center">
      <div class="flex items-center gap-3 text-sm text-neutral-500">
        <span class="i-lucide-loader-2 animate-spin text-lg" />
        Loading admin session
      </div>
    </div>

    <div v-else-if="accessError" class="grid min-h-screen place-items-center px-6">
      <section class="max-w-md w-full border border-neutral-200 rounded-lg bg-white p-6 shadow-sm">
        <div class="mb-4 h-10 w-10 flex items-center justify-center rounded-lg bg-red-50 text-red-600">
          <span class="i-lucide-shield-alert text-xl" />
        </div>
        <h1 class="text-xl font-semibold">
          Admin access required
        </h1>
        <p class="mt-2 text-sm text-neutral-500">
          {{ accessError }}
        </p>
        <a class="mt-5 h-9 inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm text-white" :href="signInUrl()">
          <span class="i-lucide-log-in" />
          Sign in
        </a>
      </section>
    </div>

    <div v-else class="admin-shell">
      <aside class="admin-sidebar">
        <div class="flex items-center gap-2 px-2 py-1.5">
          <div class="h-7 w-7 flex items-center justify-center rounded-md bg-neutral-950 text-white">
            <span class="i-lucide-sparkles text-sm" />
          </div>
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold">
              AIRI Admin
            </div>
            <div class="truncate text-xs text-neutral-500">
              Operations
            </div>
          </div>
        </div>

        <button class="quick-action" type="button" @click="$router.push('/flux')">
          <span class="i-lucide-plus-circle" />
          Quick Grant
        </button>

        <nav class="mt-3 space-y-1">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ 'nav-item-active': activeNavItem?.to === item.to }"
          >
            <span :class="item.icon" />
            {{ item.label }}
          </RouterLink>
        </nav>

        <div class="mt-auto">
          <div class="mt-4 flex items-center gap-3 rounded-lg px-2 py-2">
            <div class="h-9 w-9 flex shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm text-white">
              {{ initials }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">
                {{ me?.user.name }}
              </div>
              <div class="truncate text-xs text-neutral-500">
                {{ me?.user.email }}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main class="admin-main">
        <header class="admin-topbar">
          <div class="flex items-center gap-3">
            <span class="i-lucide-panel-left text-neutral-500" />
            <div class="h-5 w-px bg-neutral-200" />
            <h1 class="text-sm font-semibold">
              {{ currentTitle }}
            </h1>
          </div>
        </header>
        <div class="admin-content">
          <RouterView />
        </div>
      </main>
    </div>

    <Toaster rich-colors position="top-right" />
  </div>
</template>
