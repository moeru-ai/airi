import type { AnalyticsAdapter } from './client'
import type { AnalyticsAppEntry } from './index'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { vi } from 'vitest'
import { createApp, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useSettingsAnalytics } from '../../stores/settings/analytics'
import { configureAnalyticsAdapter, initializeAnalytics } from './index'

/**
 * Starts one real renderer lifecycle with a fake provider transport and real Pinia stores.
 *
 * @example
 * const renderer = startAnalyticsRenderer('auxiliary')
 * // Startup emits no app_opened event. Settings observers remain active.
 * renderer.dispose()
 */
export function startAnalyticsRenderer(appEntry: AnalyticsAppEntry) {
  localStorage.clear()
  vi.stubEnv('VITE_ENABLE_ANALYTICS', 'true')
  vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
  const capture = vi.fn<AnalyticsAdapter['capture']>(() => true)
  const adapter: AnalyticsAdapter = {
    capture,
    getIdentityHeaders: () => null,
    identify: vi.fn(),
    registerBuildInfo: vi.fn(),
    resetIdentity: vi.fn(),
    setCaptureEnabled: enabled => enabled,
  }
  configureAnalyticsAdapter(async () => adapter)
  const pinia = createPinia()
  const app = createApp({
    setup() {
      initializeAnalytics(appEntry)
      return () => h('div')
    },
  })
  app.use(pinia)
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  return {
    capture,
    settings: useSettingsAnalytics(pinia),
    dispose() {
      app.unmount()
      host.remove()
      disposePinia(pinia)
      localStorage.clear()
      vi.unstubAllEnvs()
    },
  }
}
