import { ref } from 'vue'

import { useAuthStore } from '../stores/auth'

export function useAuth() {
  const store = useAuthStore()
  import { ref } from 'vue'
  import { useAuthStore } from '../stores/auth'

  export function useAuth() {
    const store = useAuthStore()
    const loading = ref(false)

    async function parseError(res: Response, fallback = 'Request failed') {
      try {
        const body = await res.json()
        if (body && body.message) return body.message
        if (body && typeof body === 'string') return body
      } catch (e) {
        // ignore JSON parse errors
      }
      return res.statusText || fallback
    }

    async function login(email: string, password: string) {
      loading.value = true
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        if (!res.ok) {
          const message = await parseError(res, 'Login failed')
          throw new Error(message)
        }
        const data = await res.json()
        store.setAuth(data.user, data.token)
        return data
      } finally {
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
        if (!res.ok) {
          const message = await parseError(res, 'Signup failed')
          throw new Error(message)
        }
        const data = await res.json()
        store.setAuth(data.user, data.token)
        return data
      } finally {
        loading.value = false
      }
    }

    async function logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' })
      } catch (err) {
        console.error('Logout API failed:', err)
      } finally {
        store.clearAuth()
      }
    }

    async function fetchMe() {
      loading.value = true
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) {
          // clear local auth if server says invalid
          store.clearAuth()
          return
        }
        const data = await res.json()
        store.setUser(data.user)
        return data
      } catch (err) {
        console.error('fetchMe failed:', err)
        store.clearAuth()
      } finally {
        loading.value = false
      }
    }

    return { login, signup, logout, fetchMe, loading }
  }
