import { createPinia } from 'pinia'
import { afterEach, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { createI18n } from 'vue-i18n'

import StartupOverlay from './startup-overlay.vue'

import { useStartupResourcesStore } from '../../../stores/startup-resources'

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const host of hosts.splice(0))
    host.remove()
})

function mountOverlay(onFinished: () => void) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  const pinia = createPinia()
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        stage: {
          operations: { 'load-models-status': { loading: 'Loading' } },
          startup: {
            'failed': 'Startup failed',
            'failed-resource': 'Could not load {resource}',
            'interrupted': 'Load interrupted',
            'recover': 'Restart AIRI to try again.',
            'recover-model': 'Restart AIRI to try again. Or continue without a character and select another model later.',
            'details': 'Error details',
            'retry': 'Restart AIRI',
            'continue-without-model': 'Continue without a character',
            'resources': { model: 'character model' },
          },
        },
      },
    },
  })
  const app = createApp({ render: () => h(StartupOverlay, { logoSrc: '/favicon.svg', onFinished }, { default: () => h('main', 'stage') }) })
  app.use(pinia)
  app.use(i18n)
  app.mount(host)
  return { app, startup: useStartupResourcesStore(pinia) }
}

it('keeps the startup screen and retry action visible after a resource fails', async () => {
  let finished = false
  const { app, startup } = mountOverlay(() => {
    finished = true
  })
  try {
    startup.register(['model'])
    startup.start('model')
    startup.fail('model', new Error('Download failed'))

    await expect.poll(() => document.querySelector('[role="alert"]')?.textContent).toContain('Could not load character model')
    expect(document.querySelector('.startup-screen')).not.toBeNull()
    expect(document.querySelector('.startup-screen-error .startup-brand')).not.toBeNull()
    expect(document.querySelector('.startup-error-hint')?.textContent).toContain('select another model later')
    expect(document.querySelector('.startup-status-error [role="progressbar"]')).not.toBeNull()
    expect(document.querySelector('.startup-error-recovery')?.textContent).toContain('Continue without a character')
    expect(document.querySelector('.startup-error-details-content')).toBeNull()
    const detailsTrigger = document.querySelector<HTMLButtonElement>('.startup-error-details-trigger')
    detailsTrigger?.click()
    await expect.poll(() => document.querySelector('.startup-error-details-content')?.textContent).toContain('Download failed')
    await expect.poll(() => Math.round(document.querySelector('.startup-error-header')?.getBoundingClientRect().width ?? 0)).toBe(window.innerWidth)
    expect(window.innerHeight - document.querySelector('.startup-error-recovery')!.getBoundingClientRect().bottom).toBeLessThan(100)
    expect(finished).toBe(false)
  }
  finally {
    app.unmount()
  }
})

it('finishes only after all resources complete', async () => {
  let finished = false
  const { app, startup } = mountOverlay(() => {
    finished = true
  })
  try {
    startup.register(['auth', 'model'])
    startup.start('auth')
    startup.complete('auth')
    await expect.poll(() => document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50')
    expect(finished).toBe(false)

    startup.start('model')
    startup.complete('model')
    await expect.poll(() => finished).toBe(true)
  }
  finally {
    app.unmount()
  }
})
