import { createPinia } from 'pinia'
import { afterEach, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { createApp, h } from 'vue'
import { createI18n } from 'vue-i18n'

import StartupOverlay from './startup-overlay.vue'

import { useStartupResourcesStore } from '../../../stores/startup-resources'

import 'virtual:uno.css'

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
    fallbackLocale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      en: {
        stage: {
          operations: { 'load-models-status': { loading: 'Loading' } },
          startup: {
            'failed': 'Startup failed',
            'failed-resource': 'Could not load {resource}',
            'recover': 'Try again. If it fails again, open the details below.',
            'recover-model': 'Try again, or continue without a character. You can select another model later.',
            'details': 'What happened?',
            'close-details': 'Close details',
            'retry': 'Retry',
            'continue-without-model': 'Continue Anyway',
            'resources': { auth: 'account settings', model: 'character model' },
          },
        },
      },
    },
  })
  const app = createApp({ render: () => h(StartupOverlay, { logoSrc: '/favicon.svg', onFinished }, { default: () => h('main', [h('button', { id: 'covered-action' }, 'Covered action')]) }) })
  app.use(pinia)
  app.use(i18n)
  app.mount(host)
  return { app, startup: useStartupResourcesStore(pinia) }
}

it('keeps the startup screen and retry action visible after a resource fails', async () => {
  await page.viewport(1440, 900)
  let finished = false
  const { app, startup } = mountOverlay(() => {
    finished = true
  })
  try {
    startup.register(['model'])
    startup.start('model')
    await expect.poll(() => {
      const rect = document.querySelector('.startup-track')?.getBoundingClientRect()
      return rect ? Math.round(rect.top + rect.height / 2) : 0
    }).toBe(810)
    startup.fail('model', new Error('Download failed'))

    await expect.poll(() => document.querySelector('[role="alert"]')?.textContent).toContain('Could not load character model')
    expect(document.querySelector('.startup-screen')).not.toBeNull()
    expect(document.querySelector<HTMLElement>('.startup-covered-content')?.inert).toBe(true)
    expect(document.querySelector('.startup-covered-content')?.getAttribute('aria-hidden')).toBe('true')
    document.querySelector<HTMLButtonElement>('#covered-action')?.focus()
    expect(document.activeElement?.id).not.toBe('covered-action')
    expect(document.querySelector('.startup-screen-error .startup-brand')).not.toBeNull()
    expect(document.querySelector('.startup-error-hint')?.textContent).toContain('select another model later')
    expect(document.querySelector('.startup-status-error [role="progressbar"]')).not.toBeNull()
    expect(document.querySelector('.startup-error-recovery')?.textContent).toContain('Retry')
    expect(document.querySelector('.startup-error-recovery')?.textContent).toContain('Continue Anyway')
    expect(document.querySelector('.startup-error-details-tooltip')).toBeNull()
    const detailsTrigger = document.querySelector<HTMLButtonElement>('.startup-error-details-trigger')
    expect(detailsTrigger?.textContent).toContain('What happened?')
    expect(detailsTrigger!.getBoundingClientRect().width).toBeLessThan(200)
    expect(detailsTrigger!.getBoundingClientRect().top).toBeGreaterThan(document.querySelector('.startup-error-hint')!.getBoundingClientRect().bottom)
    detailsTrigger?.click()
    await expect.poll(() => document.querySelector('[role="tooltip"]')?.textContent).toContain('Download failed')
    expect(detailsTrigger?.getAttribute('aria-describedby')).toBe('startup-error-details-tooltip')
    expect(document.querySelector('.startup-error-recovery')!.getBoundingClientRect().top).toBeGreaterThan(document.querySelector('[role="tooltip"]')!.getBoundingClientRect().bottom)
    const recoveryRect = document.querySelector('.startup-error-recovery')!.getBoundingClientRect()
    await expect.poll(() => {
      const rect = document.querySelector('.startup-track')!.getBoundingClientRect()
      return Math.abs(rect.bottom - window.innerHeight + 16) + Math.abs(rect.left - 16) + Math.abs(rect.width - window.innerWidth + 32)
    }).toBeLessThanOrEqual(1)
    const progressRect = document.querySelector('.startup-track')!.getBoundingClientRect()
    const actions = document.querySelectorAll('.startup-error-action')
    expect(Math.abs(progressRect.left - 16)).toBeLessThanOrEqual(1)
    expect(Math.abs(progressRect.width - window.innerWidth + 32)).toBeLessThanOrEqual(1)
    const infoRect = document.querySelector('.startup-error-info')!.getBoundingClientRect()
    expect(recoveryRect.top).toBeGreaterThan(infoRect.bottom)
    expect(recoveryRect.top - infoRect.bottom).toBeLessThan(24)
    expect(recoveryRect.bottom).toBeLessThan(progressRect.top)
    expect(progressRect.top - recoveryRect.bottom).toBeGreaterThan(100)
    expect(document.querySelector('.startup-error-header')).toBeNull()
    expect(Math.round(recoveryRect.width)).toBe(680)
    expect(actions).toHaveLength(2)
    expect(actions[0].getBoundingClientRect().width).toBeGreaterThan(300)
    expect(document.querySelector('.startup-error-progress-heading')).toBeNull()
    document.querySelector<HTMLElement>('.startup-error-title')?.click()
    await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeNull()
    expect(finished).toBe(false)
  }
  finally {
    app.unmount()
  }
})

it('keeps mobile progress near the bottom actions', async () => {
  await page.viewport(390, 844)
  const { app, startup } = mountOverlay(() => {})
  try {
    startup.register(['model'])
    startup.start('model')
    await expect.poll(() => document.querySelector('.startup-track')?.getBoundingClientRect().width).toBeGreaterThan(200)
    const loadingProgressCenter = document.querySelector('.startup-track')!.getBoundingClientRect().y + 8
    startup.fail('model', new Error('Download failed'))

    await expect.poll(() => document.querySelector('.startup-error-title')).not.toBeNull()
    const recoveryRect = document.querySelector('.startup-error-recovery')!.getBoundingClientRect()
    const actions = document.querySelectorAll('.startup-error-action')
    expect(Math.round(recoveryRect.width)).toBe(window.innerWidth - 32)
    expect(document.querySelector('.startup-error-header')).toBeNull()
    expect(getComputedStyle(document.querySelector('.startup-screen-error .startup-brand')!).display).toBe('none')
    expect(actions).toHaveLength(2)
    expect(actions[0].getBoundingClientRect().width).toBe(window.innerWidth - 32)
    await expect.poll(() => {
      const rect = document.querySelector('.startup-track')!.getBoundingClientRect()
      return Math.abs(rect.left - 16) + Math.abs(rect.width - window.innerWidth + 32)
    }).toBeLessThanOrEqual(1)
    const errorProgressRect = document.querySelector('.startup-track')!.getBoundingClientRect()
    expect(loadingProgressCenter - errorProgressRect.y - errorProgressRect.height / 2).toBeGreaterThan(20)
    expect(Math.abs(errorProgressRect.left - 16)).toBeLessThanOrEqual(1)
    expect(Math.abs(errorProgressRect.width - window.innerWidth + 32)).toBeLessThanOrEqual(1)
    expect(document.querySelector('.startup-error-title')!.getBoundingClientRect().bottom).toBeLessThan(errorProgressRect.top)
    expect(Math.round(recoveryRect.top - errorProgressRect.bottom)).toBe(12)
    expect(document.querySelector('.startup-error-progress-heading')).toBeNull()
    await page.viewport(320, 568)
    await expect.poll(() => {
      const rect = document.querySelector('.startup-track')!.getBoundingClientRect()
      return Math.abs(rect.width - window.innerWidth + 32)
    }).toBeLessThanOrEqual(1)
    const progressRect = document.querySelector('.startup-track')!.getBoundingClientRect()
    const compactRecoveryRect = document.querySelector('.startup-error-recovery')!.getBoundingClientRect()
    expect(Math.abs(progressRect.left - 16)).toBeLessThanOrEqual(1)
    expect(Math.abs(progressRect.width - window.innerWidth + 32)).toBeLessThanOrEqual(1)
    expect(document.querySelector('.startup-error-details-trigger')!.getBoundingClientRect().bottom).toBeLessThan(progressRect.top)
    expect(compactRecoveryRect.top).toBeGreaterThan(document.querySelector('.startup-error-details-trigger')!.getBoundingClientRect().bottom)
    expect(Math.round(compactRecoveryRect.top - progressRect.bottom)).toBe(12)
    document.querySelector<HTMLButtonElement>('.startup-error-details-trigger')?.click()
    await expect.poll(() => document.querySelector('.startup-error-details-drawer')?.textContent).toContain('Download failed')
    const detailsRect = document.querySelector('.startup-error-details-drawer')!.getBoundingClientRect()
    expect(detailsRect.left).toBe(0)
    expect(detailsRect.right).toBe(window.innerWidth)
    await expect.poll(() => Math.round(document.querySelector('.startup-error-details-drawer')!.getBoundingClientRect().bottom)).toBe(window.innerHeight)
    document.querySelector<HTMLButtonElement>('.startup-error-details-close')?.click()
    await expect.poll(() => document.querySelector('.startup-error-details-drawer')).toBeNull()
  }
  finally {
    app.unmount()
    await page.viewport(1440, 900)
  }
})

it('offers Retry without a continue action when a required resource fails', async () => {
  await page.viewport(390, 844)
  const { app, startup } = mountOverlay(() => {})
  try {
    startup.register(['auth'])
    startup.start('auth')
    startup.fail('auth', new Error('Account setup failed'))

    await expect.poll(() => document.querySelector('[role="alert"]')?.textContent).toContain('Could not load account settings')
    expect(document.querySelector('.startup-error-recovery')?.textContent).toContain('Retry')
    expect(document.querySelector('.startup-error-recovery')?.textContent).not.toContain('Continue Anyway')
    await expect.poll(() => document.querySelector('.startup-error-title')).not.toBeNull()
    const progressRect = document.querySelector('.startup-track')!.getBoundingClientRect()
    const recoveryRect = document.querySelector('.startup-error-recovery')!.getBoundingClientRect()
    expect(progressRect.left).toBe(16)
    expect(progressRect.width).toBe(window.innerWidth - 32)
    expect(document.querySelector('.startup-error-header')).toBeNull()
    expect(Math.round(recoveryRect.top - progressRect.bottom)).toBe(12)
  }
  finally {
    app.unmount()
    await page.viewport(1440, 900)
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
    expect(document.querySelector<HTMLElement>('.startup-covered-content')?.inert).toBe(false)
    document.querySelector<HTMLButtonElement>('#covered-action')?.focus()
    expect(document.activeElement?.id).toBe('covered-action')
  }
  finally {
    app.unmount()
  }
})
