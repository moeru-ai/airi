import type { Pinia } from 'pinia'

import { computed } from 'vue'

import { useAuthStore } from '../stores/auth'

interface VerifiedSession {
  readonly userId: string
  readonly sessionVersion: number
}

export function useVerifiedSession(pinia?: Pinia) {
  const auth = useAuthStore(pinia)

  return computed<VerifiedSession | null>(() => auth.isAuthenticated && auth.isSessionVerified
    ? { userId: auth.userId, sessionVersion: auth.sessionVersion }
    : null)
}
