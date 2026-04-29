import type { Ref } from 'vue'

import { StorageSerializers, useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

interface LocalAvatarUser {
  id: string
  image?: string | null
}

/**
 * Provides a local account-avatar override for the current authenticated user.
 *
 * Use when:
 * - A view needs to display the user's locally uploaded avatar.
 * - A view needs to update that local avatar without mutating server-backed auth state.
 *
 * Expects:
 * - `user` is a reactive ref from the auth store or an equivalent user source.
 * - Local avatars are device-local and keyed by stable user ID.
 *
 * Returns:
 * - `userAvatar`, preferring the local override and falling back to `user.image`.
 * - `setLocalUserAvatar`, which replaces the current user's stored local avatar.
 */
export function useLocalUserAvatar(user: Ref<LocalAvatarUser | null | undefined>) {
  const localAvatarByUserId = useLocalStorage<Record<string, string>>('auth/v1/local-avatar-by-user-id', {}, {
    serializer: StorageSerializers.object,
  })

  const localUserAvatar = computed(() => {
    const userId = user.value?.id
    if (!userId)
      return null
    return localAvatarByUserId.value[userId] ?? null
  })

  const userAvatar = computed(() => localUserAvatar.value ?? user.value?.image ?? null)

  function setLocalUserAvatar(image: string): void {
    const userId = user.value?.id
    if (!userId)
      return

    localAvatarByUserId.value = {
      ...localAvatarByUserId.value,
      [userId]: image,
    }
  }

  return {
    localUserAvatar,
    setLocalUserAvatar,
    userAvatar,
  }
}
