import type { ControlsIslandDock } from './use-controls-island-placement'

import en from '@proj-airi/i18n/locales/en'

import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { computed, nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import ControlsIsland from './index.vue'

import { electronOpenSettings } from '../../../../shared/eventa'
import { controlsIslandPlacementKey } from './use-controls-island-placement'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const isOutside = ref(false)
const openSettings = vi.fn().mockResolvedValue(undefined)
const authState = vi.hoisted(() => ({
  credits: { value: 0 },
  isAuthenticated: { value: false },
  needsLogin: { value: false },
  user: { value: null as { createdAt: Date, email: string, emailVerified: boolean, id: string, name: string, updatedAt: Date } | null },
}))

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaContext: () => ref({ on: vi.fn(), emit: vi.fn() }),
  useElectronEventaInvoke: (event: unknown) => event === electronOpenSettings ? openSettings : vi.fn().mockResolvedValue(false),
  useElectronMouseInElement: () => ({ isOutside }),
}))

vi.mock('@moeru/eventa', async importOriginal => ({
  ...await importOriginal<typeof import('@moeru/eventa')>(),
  defineInvoke: () => vi.fn(),
}))

vi.mock('@proj-airi/stage-ui/stores/auth', async () => {
  const { ref } = await import('vue')
  authState.credits = ref(0)
  authState.isAuthenticated = ref(false)
  authState.needsLogin = ref(false)
  authState.user = ref(null)

  return { useAuthStore: () => authState }
})

function scrollOwners(island: HTMLElement) {
  return Array.from(island.querySelectorAll<HTMLElement>('[data-reka-scroll-area-viewport]'))
    .filter(element => getComputedStyle(element).overflowY === 'scroll' && element.scrollHeight > element.clientHeight)
}

const docks: ControlsIslandDock[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const sizes = ['small', 'large', 'auto'] as const

function mountControlsIsland(dock: ControlsIslandDock, size: typeof sizes[number] = 'auto') {
  const pinia = createPinia()
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  const screen = render(ControlsIsland, {
    global: {
      provide: {
        [controlsIslandPlacementKey as symbol]: {
          dock: ref(dock),
          isTop: computed(() => dock.startsWith('top')),
          isLeft: computed(() => dock.endsWith('left')),
          motionPhase: ref('idle'),
        },
      },
      plugins: [pinia, i18n],
      directives: { 'track-button': {} },
    },
  })
  useSettings(pinia).controlsIslandIconSize = size

  return { auth: authState, i18n, screen, settings: useSettings(pinia) }
}

beforeEach(() => {
  isOutside.value = false
  openSettings.mockClear()
})

describe('controls Island overflow', () => {
  for (const dock of docks) {
    for (const size of sizes) {
      // ROOT CAUSE:
      // The expanded panel had no viewport limit or scroll owner. Its first rows
      // left the window when the panel and main controls exceeded its height.
      // The menu now owns scrolling until the main controls fill the viewport.
      // https://github.com/moeru-ai/airi/issues/2400
      it(`Issue #2400 keeps ${dock} ${size} controls reachable across measured boundaries`, async () => {
        await page.viewport(450, 600)
        const { i18n, screen } = mountControlsIsland(dock, size)
        await nextTick()
        const island = screen.getByTestId('controls-island').element() as HTMLElement
        const main = screen.getByTestId('main-controls').element() as HTMLElement
        const label = (key: string) => i18n.global.t(`tamagotchi.stage.controls-island.${key}`)
        await expect.poll(() => Number.parseFloat(getComputedStyle(main.querySelector('div.size-3, div.size-5')!).width)).toBe(size === 'small' ? 12 : 20)
        const mainHeight = main.getBoundingClientRect().height
        const mainBefore = main.getBoundingClientRect()
        await screen.getByLabelText(label('expand'), { exact: true }).click()
        const menu = screen.getByTestId('controls-menu').element() as HTMLElement
        await expect.poll(() => island.getBoundingClientRect().height).toBeGreaterThan(mainHeight)
        expect(main.getBoundingClientRect().top).toBe(mainBefore.top)
        expect(main.getBoundingClientRect().right).toBe(mainBefore.right)
        expect(scrollOwners(island)).toHaveLength(0)
        const naturalHeight = island.getBoundingClientRect().height
        const naturalWidth = island.getBoundingClientRect().width

        for (const height of [naturalHeight + 17, naturalHeight + 16, naturalHeight + 15, mainHeight + 17, mainHeight + 16, mainHeight + 15, 600]) {
          await page.viewport(450, Math.ceil(height))
          await expect.poll(() => island.getBoundingClientRect().height).toBeLessThanOrEqual(height - 16)
          expect(island.getBoundingClientRect().top).toBeGreaterThanOrEqual(8)
          expect(island.getBoundingClientRect().bottom).toBeLessThanOrEqual(height - 8)
          expect(main.getBoundingClientRect().height).toBe(mainHeight)
          const expectedOwnerCount = height < naturalHeight + 16 ? 1 : 0
          await expect.poll(() => scrollOwners(island).length).toBe(expectedOwnerCount)
          if (expectedOwnerCount) {
            const owner = scrollOwners(island)[0]!
            expect(menu.contains(owner)).toBe(height > mainHeight + 16)
            owner.scrollTop = owner.scrollHeight
            expect(owner.scrollTop).toBeGreaterThan(0)
          }
        }

        for (const width of [naturalWidth + 17, naturalWidth + 16, naturalWidth + 15, 40, 450]) {
          await page.viewport(Math.ceil(width), 600)
          await expect.poll(() => island.getBoundingClientRect().width).toBeLessThanOrEqual(width - 16)
          expect(island.getBoundingClientRect().left).toBeGreaterThanOrEqual(8)
          expect(menu.getBoundingClientRect().width).toBe(naturalWidth)
          const outer = island.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')!
          if (width < naturalWidth + 16) {
            outer.scrollLeft = outer.scrollWidth
            expect(outer.scrollLeft).toBeGreaterThan(0)
          }
        }

        await page.viewport(450, Math.ceil(mainHeight + 60))
        const settings = screen.getByLabelText(label('open-settings'), { exact: true })
        const settingsElement = settings.element() as HTMLElement
        settingsElement.focus()
        await expect.poll(() => settingsElement.getBoundingClientRect().top).toBeGreaterThanOrEqual(8)
        await settings.click()
        expect(openSettings).toHaveBeenCalledWith({ route: '/settings' })

        await screen.getByLabelText(label('collapse'), { exact: true }).click()
        await expect.poll(() => screen.container.querySelector('[data-testid="controls-menu"]')).toBeNull()
        await screen.getByLabelText(label('expand'), { exact: true }).click()
        const reopenedViewport = screen.getByTestId('controls-menu').element().querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')!
        expect(reopenedViewport.scrollTop).toBe(0)
      })
    }
  }

  for (const dock of ['top-right', 'bottom-right'] as const) {
    it(`Issue #2400 aligns ${dock} controls to the visible right edge`, async () => {
      await page.viewport(450, 600)
      const { i18n, screen } = mountControlsIsland(dock)
      const label = (key: string) => i18n.global.t(`tamagotchi.stage.controls-island.${key}`)

      await screen.getByLabelText(label('expand'), { exact: true }).click()
      const island = screen.getByTestId('controls-island').element() as HTMLElement
      const naturalWidth = island.getBoundingClientRect().width
      await page.viewport(Math.max(40, Math.floor(naturalWidth / 2)), 600)

      const viewport = island.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')!
      await expect.poll(() => viewport.scrollLeft).toBeGreaterThan(0)
    })
  }

  it('issue #2400 realigns the right dock after an icon size change', async () => {
    await page.viewport(450, 600)
    const { i18n, screen, settings } = mountControlsIsland('bottom-right', 'small')
    const label = (key: string) => i18n.global.t(`tamagotchi.stage.controls-island.${key}`)

    await screen.getByLabelText(label('expand'), { exact: true }).click()
    const island = screen.getByTestId('controls-island').element() as HTMLElement
    const viewport = island.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')!
    await page.viewport(40, 600)
    await expect.poll(() => viewport.scrollLeft).toBeGreaterThan(0)
    const previousScrollWidth = viewport.scrollWidth

    settings.controlsIslandIconSize = 'large'
    await expect.poll(() => viewport.scrollWidth).toBeGreaterThan(previousScrollWidth)
    await expect.poll(() => viewport.scrollLeft).toBe(viewport.scrollWidth - viewport.clientWidth)
  })

  it('issue #2400 raises portaled control tooltips above the stage', async () => {
    await page.viewport(450, 600)
    const { i18n, screen } = mountControlsIsland('bottom-right')
    const label = (key: string) => i18n.global.t(`tamagotchi.stage.controls-island.${key}`)

    await screen.getByLabelText(label('expand'), { exact: true }).click()
    await screen.getByLabelText(label('open-settings'), { exact: true }).hover()

    const tooltipWrapper = '[data-reka-popper-content-wrapper]'
    await expect.poll(() => document.querySelector(tooltipWrapper)).not.toBeNull()
    expect(getComputedStyle(document.querySelector(tooltipWrapper)!).zIndex).toBe('1000')
  })

  it('issue #2400 realigns the right dock after authentication content grows', async () => {
    await page.viewport(450, 600)
    const { auth, i18n, screen } = mountControlsIsland('bottom-right')
    const label = (key: string) => i18n.global.t(`tamagotchi.stage.controls-island.${key}`)

    await screen.getByLabelText(label('expand'), { exact: true }).click()
    const island = screen.getByTestId('controls-island').element() as HTMLElement
    const viewport = island.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')!
    await page.viewport(40, 600)
    await expect.poll(() => viewport.scrollLeft).toBeGreaterThan(0)
    const previousScrollWidth = viewport.scrollWidth

    auth.credits.value = 999999999
    auth.isAuthenticated.value = true
    auth.user.value = {
      createdAt: new Date('2020-01-01'),
      email: 'user@example.com',
      emailVerified: true,
      id: 'user',
      name: 'A very long authenticated user name that changes the island width',
      updatedAt: new Date('2020-01-01'),
    }

    await expect.poll(() => viewport.scrollWidth).toBeGreaterThan(previousScrollWidth)
    await expect.poll(() => viewport.scrollLeft).toBe(viewport.scrollWidth - viewport.clientWidth)
  })

  // The interaction path is independent from the size and dock matrix.
  it('issue #2400 keeps the expanded menu open during a scrollbar drag', async () => {
    await page.viewport(450, 300)
    const { i18n, screen } = mountControlsIsland('bottom-right')
    const label = (key: string) => i18n.global.t(`tamagotchi.stage.controls-island.${key}`)
    await screen.getByLabelText(label('expand'), { exact: true }).click()

    const island = screen.getByTestId('controls-island').element() as HTMLElement
    const settings = screen.getByLabelText(label('open-settings'), { exact: true }).element() as HTMLElement
    settings.focus()
    expect(island.contains(document.activeElement)).toBe(true)
    expect(settings.getBoundingClientRect().bottom).toBeGreaterThan(8)

    island.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    isOutside.value = true
    await new Promise(resolve => setTimeout(resolve, 1700))
    expect(screen.getByTestId('controls-menu').element()).toBeInTheDocument()
    window.dispatchEvent(new MouseEvent('mouseup'))
    await expect.poll(() => screen.container.querySelector('[data-testid="controls-menu"]'), { timeout: 3500 }).toBeNull()
  })
})
