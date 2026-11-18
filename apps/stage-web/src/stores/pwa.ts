import { isEnvTruthy } from '@proj-airi/stage-shared'
import { ToasterPWAUpdateReady } from '@proj-airi/stage-ui/components'
import { breakpointsTailwind, useBreakpoints, useEventListener } from '@vueuse/core'
import { defineStore } from 'pinia'
import { h, markRaw, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

// AIRI is often left open for days. Without a periodic check the browser only looks for a
// new service worker on navigation, so a long-lived tab never learns about a deploy.
const UPDATE_CHECK_INTERVAL_MS = Number(import.meta.env.VITE_PWA_UPDATE_CHECK_INTERVAL_MS) || 60 * 60 * 1000
// "Not now" hides the prompt; it comes back on a later check after this long.
const REMIND_AFTER_MS = 6 * 60 * 60 * 1000
const TOAST_ID = 'pwa-update-ready'

export const usePWAStore = defineStore('pwa', () => {
  const updateReadyHooks = ref<(() => void)[]>([])
  const needRefresh = ref(false)
  const lastCheckedAt = ref<string>()
  const breakpoints = useBreakpoints(breakpointsTailwind)
  const isMobile = breakpoints.smaller('md')
  let dismissedAt = 0

  onMounted(async () => {
    if (import.meta.env.SSR) {
      return
    }
    if (isEnvTruthy(import.meta.env.VITE_APP_TARGET_HUGGINGFACE_SPACE)) {
      return
    }

    const { registerSW } = await import('../modules/pwa')

    // Assigned by registerSW below; the prompt only calls it after registration.
    let updateSW: (reloadPage?: boolean) => Promise<void> = async () => {}

    function showPrompt() {
      if (Date.now() - dismissedAt < REMIND_AFTER_MS) {
        return
      }
      console.info('[pwa] prompt shown')
      toast.custom(markRaw(h(ToasterPWAUpdateReady, {
        id: TOAST_ID,
        onUpdate: () => {
          console.info('[pwa] user accepted; activating the waiting service worker and reloading')
          void updateSW(true)
        },
        onDismiss: () => {
          dismissedAt = Date.now()
          console.info('[pwa] prompt dismissed; reminding again after', REMIND_AFTER_MS, 'ms')
        },
      })), {
        id: TOAST_ID,
        // Stay until the user answers: a toast that times out is an update nobody saw.
        duration: Number.POSITIVE_INFINITY,
        position: isMobile.value ? 'top-center' : 'bottom-right',
      })
    }

    let registration: ServiceWorkerRegistration | undefined
    async function checkForUpdate(reason: string) {
      if (!registration || registration.installing || !navigator.onLine) {
        return
      }
      lastCheckedAt.value = new Date().toISOString()
      console.info('[pwa] checking for a new service worker', { reason })
      try {
        await registration.update()
      }
      catch (err) {
        console.warn('[pwa] update check failed', err)
      }
      if (needRefresh.value) {
        showPrompt()
      }
    }

    updateSW = registerSW({
      onRegisteredSW(swUrl, r) {
        registration = r
        console.info('[pwa] service worker registered', { swUrl, active: !!r?.active, waiting: !!r?.waiting, intervalMs: UPDATE_CHECK_INTERVAL_MS })
        setInterval(() => void checkForUpdate('interval'), UPDATE_CHECK_INTERVAL_MS)
      },
      onRegisterError(err) {
        console.warn('[pwa] service worker registration failed', err)
      },
      onNeedRefresh: () => {
        needRefresh.value = true
        console.info('[pwa] new service worker installed and waiting')
        showPrompt()
      },
    })

    // Coming back to the tab is the cheapest moment to look again.
    useEventListener(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdate('visible')
      }
    })
    useEventListener(window, 'online', () => void checkForUpdate('online'))

    updateReadyHooks.value.push(updateSW)
  })

  return { needRefresh, lastCheckedAt }
})
