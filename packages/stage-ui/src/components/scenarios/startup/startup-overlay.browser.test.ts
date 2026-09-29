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
            'interrupted': 'Load interrupted',
            'recover': 'Try again. If it fails again, select the information icon for details.',
            'recover-model': 'Try again, or continue without a character. You can select another model later.',
            'details': 'Error details',
            'retry': 'Retry',
            'continue-without-model': 'Continue Anyway',
            'resources': { auth: 'account settings', model: 'character model' },
          },
        },
      },
      ja: {},
    },
  })
  const app = createApp({ render: () => h(StartupOverlay, { logoSrc: '/favicon.svg', onFinished }, { default: () => h('main', [h('button', { id: 'covered-action' }, 'Covered action')]) }) })
  app.use(pinia)
  app.use(i18n)
  app.mount(host)
  return { app, startup: useStartupResourcesStore(pinia), i18n }
}

it('keeps the startup screen and retry action visible after a resource fails', async () => {
  await page.viewport(1440, 900)
  let finished = false
  const { app, startup, i18n } = mountOverlay(() => {
    finished = true
  })
  try {
    startup.register(['model'])
    startup.start('model')
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
    expect(document.querySelector('.startup-error-details-content')).toBeNull()
    const detailsTrigger = document.querySelector<HTMLButtonElement>('.startup-error-details-trigger')
    detailsTrigger?.click()
    await expect.poll(() => document.querySelector('.startup-error-details-content')?.textContent).toContain('Download failed')
    const header = document.querySelector('.startup-error-header')!
    const headerRect = header.getBoundingClientRect()
    const recoveryRect = document.querySelector('.startup-error-recovery')!.getBoundingClientRect()
    const actions = document.querySelectorAll('.startup-error-action')
    expect(Math.round(headerRect.width)).toBe(680)
    expect(Math.round(headerRect.left)).toBe(Math.round((window.innerWidth - headerRect.width) / 2))
    expect(Math.round(recoveryRect.width)).toBe(680)
    expect(window.innerHeight - recoveryRect.bottom).toBeLessThanOrEqual(40)
    expect(actions).toHaveLength(2)
    expect(actions[0].getBoundingClientRect().width).toBeGreaterThan(300)
    expect(header.querySelector('.startup-error-symbol')?.getBoundingClientRect().left).toBeGreaterThan(headerRect.left + 600)
    expect(header.firstElementChild?.classList.contains('startup-error-status-label')).toBe(true)
    expect(getComputedStyle(header, '::before').animationName).toContain('startup-warning-scroll')
    expect(getComputedStyle(header, '::after').content).toBe('none')
    expect(getComputedStyle(document.querySelector('.startup-error-header')!).fontFamily).toContain('WDXL Lubrifont SC')
    i18n.global.locale.value = 'ja'
    await expect.poll(() => getComputedStyle(document.querySelector('.startup-error-header')!).fontFamily).toContain('WDXL Lubrifont JP N')
    expect(finished).toBe(false)
  }
  finally {
    app.unmount()
  }
})

it('fills narrow screens with the warning band and bottom actions', async () => {
  await page.viewport(390, 844)
  const { app, startup } = mountOverlay(() => {})
  try {
    startup.register(['model'])
    startup.start('model')
    startup.fail('model', new Error('Download failed'))

    await expect.poll(() => document.querySelector('.startup-error-header')).not.toBeNull()
    const headerRect = document.querySelector('.startup-error-header')!.getBoundingClientRect()
    const recoveryRect = document.querySelector('.startup-error-recovery')!.getBoundingClientRect()
    const actions = document.querySelectorAll('.startup-error-action')
    expect(Math.round(headerRect.width)).toBe(window.innerWidth)
    expect(Math.round(recoveryRect.width)).toBe(window.innerWidth - 32)
    expect(window.innerHeight - recoveryRect.bottom).toBeLessThanOrEqual(40)
    expect(actions).toHaveLength(2)
    expect(actions[0].getBoundingClientRect().width).toBe(window.innerWidth - 32)
    await page.viewport(320, 568)
    document.querySelector<HTMLButtonElement>('.startup-error-details-trigger')?.click()
    await expect.poll(() => document.querySelector('.startup-error-details-content')).not.toBeNull()
    const detailsRect = document.querySelector('.startup-error-details-content')!.getBoundingClientRect()
    expect(detailsRect.left).toBeGreaterThanOrEqual(0)
    expect(detailsRect.right).toBeLessThanOrEqual(window.innerWidth)
  }
  finally {
    app.unmount()
    await page.viewport(1440, 900)
  }
})

it('offers Retry without a continue action when a required resource fails', async () => {
  const { app, startup } = mountOverlay(() => {})
  try {
    startup.register(['auth'])
    startup.start('auth')
    startup.fail('auth', new Error('Account setup failed'))

    await expect.poll(() => document.querySelector('[role="alert"]')?.textContent).toContain('Could not load account settings')
    expect(document.querySelector('.startup-error-recovery')?.textContent).toContain('Retry')
    expect(document.querySelector('.startup-error-recovery')?.textContent).not.toContain('Continue Anyway')
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
    expect(document.querySelector<HTMLElement>('.startup-covered-content')?.inert).toBe(false)
    document.querySelector<HTMLButtonElement>('#covered-action')?.focus()
    expect(document.activeElement?.id).toBe('covered-action')
  }
  finally {
    app.unmount()
  }
})
