import { defineStore } from 'pinia'

export type User = {
  id: string
  name: string
  email?: string
  avatarUrl?: string
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    token: null as string | null,
    loading: false as boolean
  }),
  actions: {
    setAuth(user: User, token: string) {
      this.user = user
      this.token = token
    },
    setUser(user: User) {
      this.user = user
    },
    clearAuth() {
      this.user = null
      this.token = null
    }
  }
})
