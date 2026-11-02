import type { ElectronWindowControlsState } from '../../../shared/eventa'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import TitleBar from './TitleBar.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const mocks = vi.hoisted(() => ({
  getState: vi.fn<() => Promise<ElectronWindowControlsState>>(),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  listeners: new Set<(event: { body: ElectronWindowControlsState }) => void>(),
}))

// NOTICE:
// The window state lives in the Electron main process. The doubles answer for it, so the test
// controls what the window allows and when the state changes.
// Removal condition: browser tests running inside an Electron renderer.
vi.mock('@proj-airi/electron-vueuse', async () => {
  const eventa = await import('../../../shared/eventa')
  return {
    useElectronEventaContext: () => ({
      value: {
        on: (_event: unknown, listener: (event: { body: ElectronWindowControlsState }) => void) => {
          mocks.listeners.add(listener)
          return () => mocks.listeners.delete(listener)
        },
      },
    }),
    useElectronEventaInvoke: (event: unknown) => {
      if (event === eventa.electronGetWindowControlsState)
        return mocks.getState
      if (event === eventa.electronWindowMinimize)
        return mocks.minimize
      if (event === eventa.electronWindowToggleMaximize)
        return mocks.toggleMaximize
      return mocks.close
    },
  }
})

const windowsState: ElectronWindowControlsState = {
  systemControls: false,
  fullscreen: false,
  maximized: false,
  minimizable: true,
  maximizable: true,
  closable: true,
}

function renderTitleBar(state: Partial<ElectronWindowControlsState> = {}) {
  mocks.getState.mockResolvedValue({ ...windowsState, ...state })
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      en: {
        tamagotchi: {
          stage: {
            window: { minimize: 'Minimize', maximize: 'Maximize', restore: 'Restore', close: 'Close' },
          },
        },
      },
    },
  })
  return render(TitleBar, {
    props: { title: 'Chat', icon: 'i-solar:chat-line-bold' },
    global: { plugins: [i18n] },
  })
}

function emitState(state: Partial<ElectronWindowControlsState>) {
  for (const listener of mocks.listeners)
    listener({ body: { ...windowsState, ...state } })
}

describe('window title bar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    mocks.listeners.clear()
  })

  it('draws the window buttons on Windows and Linux, and each button drives the window', async () => {
    renderTitleBar()

    await page.getByRole('button', { name: 'Minimize' }).click()
    await page.getByRole('button', { name: 'Maximize' }).click()
    await page.getByRole('button', { name: 'Close' }).click()

    expect(mocks.minimize).toHaveBeenCalledTimes(1)
    expect(mocks.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('leaves out the buttons that the window does not allow', async () => {
    renderTitleBar({ minimizable: false, maximizable: false })

    await expect.element(page.getByRole('button', { name: 'Close' })).toBeVisible()
    expect(page.getByRole('button', { name: 'Minimize' }).elements()).toHaveLength(0)
    expect(page.getByRole('button', { name: 'Maximize' }).elements()).toHaveLength(0)
  })

  it('changes maximize to restore when the window maximizes', async () => {
    renderTitleBar()
    await expect.element(page.getByRole('button', { name: 'Maximize' })).toBeVisible()

    emitState({ maximized: true })

    await expect.element(page.getByRole('button', { name: 'Restore' })).toBeVisible()
    expect(page.getByRole('button', { name: 'Maximize' }).elements()).toHaveLength(0)
  })

  it('draws no buttons on macOS and leaves room for the traffic lights', async () => {
    renderTitleBar({ systemControls: true })
    const bar = page.getByTestId('window-title-bar')

    await expect.element(bar).toHaveClass('pl-20')
    expect(page.getByTestId('window-controls').elements()).toHaveLength(0)
  })

  it('stops leaving room for the traffic lights in macOS fullscreen', async () => {
    renderTitleBar({ systemControls: true })
    const bar = page.getByTestId('window-title-bar')
    await expect.element(bar).toHaveClass('pl-20')

    emitState({ systemControls: true, fullscreen: true })

    await expect.element(bar).toHaveClass('pl-4')
  })
})
