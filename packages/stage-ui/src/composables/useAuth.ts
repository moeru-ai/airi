import { ref } from 'vue'

import { useAuthStore } from '../stores/auth'

export function useAuth() {
  const store = useAuthStore()
  const loading = ref(false)

  async function login(email: string, password: string) {
    loading.value = true
    try {
      // Placeholder: replace with real API call in app
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok)
        throw new Error('Login failed')
      const data = await res.json()
      store.setAuth(data.user, data.token)
    }
    finally {
      loading.value = false
    }
  }

  async function signup(name: string, email: string, password: string) {
    loading.value = true
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      if (!res.ok)
        throw new Error('Signup failed')
      const data = await res.json()
      store.setAuth(data.user, data.token)
    }
    finally {
      loading.value = false
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    store.clearAuth()
  }

  async function fetchMe() {
    loading.value = true
    try {
      const res = await fetch('/api/auth/me')
      if (!res.ok)
        return
      const data = await res.json()
      store.setUser(data.user)
    }
    finally {
      loading.value = false
    }
  }

  return { login, signup, logout, fetchMe, loading }
}
