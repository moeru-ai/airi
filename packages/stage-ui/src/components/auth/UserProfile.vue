<script lang="ts">
import { computed } from 'vue'

import { useAuthStore } from '../../stores/auth'
import { useAuth } from '../../composables/useAuth'

export default {
  setup() {
    const store = useAuthStore()
    const { logout } = useAuth()
    const user = computed(() => store.user)
    const defaultAvatar = '/assets/default-avatar.png'

    const onEdit = () => {
      // open edit modal (to be implemented by app)
      console.log('edit profile')
    }

    return { user, defaultAvatar, onEdit, logout }
  },
}
</script>

<template>
  <div class="bg-card mx-auto max-w-md flex items-center gap-4 rounded-lg p-6 shadow-sm">
    <img :src="user?.avatarUrl || defaultAvatar" alt="avatar" class="h-16 w-16 rounded-full object-cover">
    <div class="flex-1">
      <div class="flex items-center justify-between">
        <div>
          <div class="font-medium">
            {{ user?.name || $t('auth.profile.anonymous') }}
          </div>
          <div class="text-muted text-sm">
            {{ user?.email }}
          </div>
        </div>
        <div class="flex gap-2">
          <button class="btn-secondary" @click="onEdit">
            {{ $t('auth.profile.edit') }}
          </button>
          <button class="btn-ghost text-red-500" @click="logout">
            {{ $t('auth.logout') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bg-card { background: var(--card-bg); }
.btn-secondary { padding: .4rem .6rem; border-radius: .5rem; border:1px solid var(--border); }
.btn-ghost { background: transparent; }
</style>
