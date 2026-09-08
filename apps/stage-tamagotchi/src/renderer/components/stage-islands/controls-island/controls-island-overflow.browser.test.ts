import type { AiriCard } from '@proj-airi/stage-ui/stores/modules/airi-card'

import type { ControlsIslandDock } from './use-controls-island-placement'

import en from '@proj-airi/i18n/locales/en'

import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision/store'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
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
  useElectronEventaContext: () => ref({ on: vi.fn(() => vi.fn()), emit: vi.fn() }),
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

function mountControlsIsland(dock: ControlsIslandDock, size: typeof sizes[number] = 'auto', dockRef = ref(dock), initializeProfile = false) {
  const pinia = createPinia()
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  const component = initializeProfile
    ? defineComponent({
        setup() {
          // Seed the profile store without invoking the stage's asynchronous
          // runtime initialization. The profile form only needs an active card.
          const cards = useAiriCardStore()
          // Create the stores that card duplication reads while Vue still has
          // a component setup context. The action itself can then reuse them.
          useArtistryStore()
          useConsciousnessStore()
          useSpeechStore()
          useSettingsStageModel()
          useVisionStore()
          const defaultCard = {
            name: 'ReLU',
            version: '1.0.0',
            extensions: {
              airi: {
                modules: {
                  consciousness: { provider: '', model: '' },
                  vision: { provider: '', model: '' },
                  speech: { provider: '', model: '', voice_id: '' },
                },
                agents: {},
              },
            },
          } satisfies AiriCard
          cards.cards.set('default', defaultCard)
          return () => h(ControlsIsland)
        },
      })
    : ControlsIsland
  const screen = render(component, {
    global: {
      provide: {
        [controlsIslandPlacementKey as symbol]: {
          dock: dockRef,
          isTop: computed(() => dockRef.value.startsWith('top')),
          isLeft: computed(() => dockRef.value.endsWith('left')),
          motionPhase: ref('idle'),
        },
      },
      plugins: [pinia, i18n],
      directives: { 'track-button': {} },
    },
  })
  useSettings(pinia).controlsIslandIconSize = size

  return { cards: useAiriCardStore(pinia), auth: authState, dock: dockRef, i18n, screen, settings: useSettings(pinia) }
}

beforeEach(() => {
  isOutside.value = false
  openSettings.mockClear()
  authState.credits.value = 0
  authState.isAuthenticated.value = false
  authState.needsLogin.value = false
  authState.user.value = null
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
        await expect.poll(() => scrollOwners(island)).toHaveLength(0)
        const naturalHeight = island.getBoundingClientRect().height
        const naturalWidth = island.getBoundingClientRect().width
        const menuHeight = menu.querySelector<HTMLElement>('.w-max')!.offsetHeight
        const isTop = dock.startsWith('top')
        const isLeft = dock.endsWith('left')

        for (const height of [naturalHeight + 17, naturalHeight + 16, naturalHeight + 15, mainHeight + 17, mainHeight + 16, mainHeight + 15, 600]) {
          await page.viewport(450, Math.ceil(height))
          const sideways = height < naturalHeight + 16
          await expect.poll(() => island.dataset.direction).toBe(sideways ? (isLeft ? 'right' : 'left') : (isTop ? 'down' : 'up'))
          await expect.poll(() => island.getBoundingClientRect().height).toBeLessThanOrEqual(Math.ceil(height) - 16)
          expect(island.getBoundingClientRect().top).toBeGreaterThanOrEqual(8)
          expect(island.getBoundingClientRect().bottom).toBeLessThanOrEqual(Math.ceil(height) - 8)
          expect(main.getBoundingClientRect().height).toBe(mainHeight)
          const expectedOwnerCount = Math.max(mainHeight, menuHeight) > Math.ceil(height) - 16 ? 1 : 0
          await expect.poll(() => scrollOwners(island).length).toBe(expectedOwnerCount)
          if (expectedOwnerCount) {
            const owner = scrollOwners(island)[0]!
            expect(menu.contains(owner)).toBe(height >= mainHeight + 16)
            owner.scrollTop = owner.scrollHeight
            expect(owner.scrollTop).toBeGreaterThan(0)
          }
        }

        for (const width of [naturalWidth + 17, naturalWidth + 16, naturalWidth + 15, 40, 450]) {
          await page.viewport(Math.ceil(width), 600)
          await expect.poll(() => island.getBoundingClientRect().width).toBeLessThanOrEqual(Math.ceil(width) - 16)
          expect(island.getBoundingClientRect().left).toBeGreaterThanOrEqual(8)
          if (width < naturalWidth + 16) {
            const owner = Array.from(island.querySelectorAll<HTMLElement>('[data-reka-scroll-area-viewport]'))
              .find(viewport => viewport.scrollWidth > viewport.clientWidth)!
            owner.scrollLeft = owner.scrollWidth
            expect(owner.scrollLeft).toBeGreaterThan(0)
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
        await expect.poll(() => menu.closest('[aria-hidden]')?.getAttribute('aria-hidden')).toBe('true')
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
      await expect.poll(() => screen.getByTestId('main-controls').element().getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth - 8)
      expect(viewport.scrollLeft).toBe(0)
    })
  }

  // ROOT CAUSE:
  // Icon size changes alter the Island geometry after a right-docked layout has
  // been aligned. The old implementation did not realign after that change.
  //
  // Before the patch, the right dock kept a stale horizontal scroll position.
  //
  // We fixed this by observing the Island geometry and aligning after updates.
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

  // ROOT CAUSE:
  // Tooltip content is portaled outside the Island and can render below the
  // stage when it uses the default stacking order.
  //
  // Before the patch, a tooltip over a control could be hidden by the stage.
  //
  // We fixed this by keeping the control tooltip portal above the stage layer.
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

  // ROOT CAUSE:
  // Authentication content can grow after the right-docked Island has been
  // aligned, which changes the horizontal overflow range.
  //
  // Before the patch, the right edge moved out of view after the user signed in.
  //
  // We fixed this by observing content geometry and realigning the dock edge.
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

  // ROOT CAUSE:
  // Dock changes reverse the horizontal edge that must remain visible, but the
  // previous scroll offset belongs to the old dock.
  //
  // Before the patch, moving from right to left kept the old right-edge offset.
  //
  // We fixed this by aligning both axes whenever the dock changes.
  it('issue #2400 resets horizontal scroll after moving from a right dock to a left dock', async () => {
    await page.viewport(450, 600)
    const { dock, i18n, screen } = mountControlsIsland('bottom-right')
    const label = (key: string) => i18n.global.t(`tamagotchi.stage.controls-island.${key}`)

    await screen.getByLabelText(label('expand'), { exact: true }).click()
    const island = screen.getByTestId('controls-island').element() as HTMLElement
    const viewport = island.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')!
    await page.viewport(40, 600)
    await expect.poll(() => viewport.scrollLeft).toBeGreaterThan(0)

    dock.value = 'bottom-left'
    await expect.poll(() => viewport.scrollLeft).toBe(0)
  })

  // ROOT CAUSE:
  // A bottom-docked Island must use the lower scroll edge when its content is
  // taller than the window, or the main controls can remain below the viewport.
  //
  // Before the patch, the bottom dock could open with its main controls clipped.
  //
  // We fixed this by aligning the outer viewport to the dock edge after layout changes.
  it('issue #2400 aligns bottom docks to the visible vertical scroll end', async () => {
    await page.viewport(450, 200)
    const { i18n, screen } = mountControlsIsland('bottom-right')
    const label = (key: string) => i18n.global.t(`tamagotchi.stage.controls-island.${key}`)

    await screen.getByLabelText(label('expand'), { exact: true }).click()
    const island = screen.getByTestId('controls-island').element() as HTMLElement
    const viewport = island.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')!
    await expect.poll(() => viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight)
    // Focused collapse remains reachable even when docking would clip it.
    const collapse = screen.getByLabelText(label('collapse'), { exact: true }).element() as HTMLElement
    expect(collapse.getBoundingClientRect().top).toBeGreaterThanOrEqual(8)
    collapse.blur()
    await page.viewport(450, 190)
    await expect.poll(() => viewport.scrollTop).toBe(viewport.scrollHeight - viewport.clientHeight)
  })

  // ROOT CAUSE:
  // A scrollbar drag can move the pointer outside the Island while the user is
  // still interacting with it.
  //
  // Before the patch, the outside timer collapsed the menu during a scrollbar drag.
  //
  // We fixed this by treating pressed scrollbar interaction as a blocked state.
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
    await expect.poll(() => screen.getByTestId('controls-menu').element().closest('[aria-hidden]')?.getAttribute('aria-hidden'), { timeout: 3500 }).toBe('true')
  })
})

// https://github.com/moeru-ai/airi/pull/2474
it('measures the collapsed menu and opens inward when height is insufficient (PR #2474)', async () => {
  // ROOT CAUSE:
  // The menu only mounted after opening and always used the vertical axis.
  // Natural content measurement now determines both placement and the arrow.
  await page.viewport(600, 300)
  const { i18n, screen } = mountControlsIsland('bottom-right')
  const island = screen.getByTestId('controls-island').element()
  await expect.poll(() => island.getAttribute('data-direction')).toBe('left')
  await screen.getByLabelText(i18n.global.t('tamagotchi.stage.controls-island.expand'), { exact: true }).click()
  const main = screen.getByTestId('main-controls').element()
  const menu = screen.getByTestId('controls-menu').element()
  await expect.poll(() => menu.getBoundingClientRect().right).toBeLessThanOrEqual(main.getBoundingClientRect().left - 12)
})

// https://github.com/moeru-ai/airi/pull/2474
it('keeps the profile creation form open for pointer interaction (PR #2474)', async () => {
  // ROOT CAUSE:
  // Closing the selector canceled creation, and the body portal counted as an
  // outside click. The selector and form must share one interaction lifecycle.
  await page.viewport(600, 300)
  const { cards, i18n, screen } = mountControlsIsland('bottom-right', 'auto', ref('bottom-right'), true)
  await screen.getByLabelText(i18n.global.t('tamagotchi.stage.controls-island.expand'), { exact: true }).click()
  await screen.getByRole('combobox').click()
  await page.getByRole('option', { name: i18n.global.t('stage.profile-switcher.save-as-new') }).click()
  const input = page.getByPlaceholder(i18n.global.t('stage.profile-switcher.new-profile-name'))
  await input.click()
  await input.fill('New profile')
  await expect.element(input).toHaveValue('New profile')
  isOutside.value = true
  await new Promise(resolve => setTimeout(resolve, 1700))
  expect(screen.getByTestId('controls-menu').element().closest('[inert]')).toBeNull()
  for (const [width, height] of [[160, 200], [100, 80], [600, 600]] as const) {
    await page.viewport(width, height)
    const form = page.getByTestId('profile-create-form').element() as HTMLElement
    await expect.poll(() => form.getBoundingClientRect().right).toBeLessThanOrEqual(width - 8)
    await expect.poll(() => form.getBoundingClientRect().bottom).toBeLessThanOrEqual(height - 8)
    expect(form.getBoundingClientRect().left).toBeGreaterThanOrEqual(8)
    expect(form.getBoundingClientRect().top).toBeGreaterThanOrEqual(8)
  }
  await page.getByRole('button', { name: i18n.global.t('stage.profile-switcher.save-as-new'), exact: true }).click()
  await expect.poll(() => cards.activeCard?.name).toBe('New profile')
  await expect.element(input).not.toBeInTheDocument()
  isOutside.value = false

  // ROOT CAUSE:
  // Reopening the selector while creation was active changed the selected
  // card but left the old form state alive. A later save could clone the new
  // card with the name entered for the previous card.
  //
  // We fixed this by canceling creation when a non-create option is selected.
  // The close-to-create transition remains allowed.
  await screen.getByRole('combobox').click()
  await page.getByRole('option', { name: i18n.global.t('stage.profile-switcher.save-as-new') }).click()
  await page.getByPlaceholder(i18n.global.t('stage.profile-switcher.new-profile-name')).fill('Stale profile name')
  await screen.getByRole('combobox').click()
  await page.getByRole('option', { name: 'ReLU' }).click()
  await expect.element(page.getByTestId('profile-create-form')).not.toBeInTheDocument()
  await expect.poll(() => cards.activeCard?.name).toBe('ReLU')

  await screen.getByRole('combobox').click()
  await page.getByRole('option', { name: i18n.global.t('stage.profile-switcher.save-as-new') }).click()
  const form = page.getByTestId('profile-create-form').element() as HTMLElement
  form.querySelectorAll<HTMLButtonElement>('button')[1]!.click()
  await expect.element(input).not.toBeInTheDocument()
})

for (const dock of docks) {
  // https://github.com/moeru-ai/airi/pull/2474
  it(`PR #2474 keeps one inert measured menu and rotates the ${dock} arrow before opening`, async () => {
    await page.viewport(600, 600)
    const { i18n, screen, settings } = mountControlsIsland(dock, 'small')
    const island = screen.getByTestId('controls-island').element() as HTMLElement
    const main = screen.getByTestId('main-controls').element() as HTMLElement
    const menu = screen.getByTestId('controls-menu').element() as HTMLElement
    const toggle = main.querySelector<HTMLButtonElement>('[aria-controls]')!
    const icon = toggle.querySelector<HTMLElement>('[i-solar\\:alt-arrow-up-line-duotone]')!
    const isTop = dock.startsWith('top')
    const isLeft = dock.endsWith('left')
    await expect.poll(() => island.offsetHeight === main.offsetHeight).toBe(true)
    expect(toggle.getAttribute('aria-controls')).toBe(menu.id)
    expect(menu.closest('[inert]')).not.toBeNull()
    const hiddenButton = menu.querySelector<HTMLButtonElement>('button')!
    hiddenButton.focus()
    expect(document.activeElement).not.toBe(hiddenButton)
    await expect.poll(() => icon.style.transform).toBe(`rotate(${isTop ? 180 : 0}deg)`)
    await page.viewport(600, 120)
    await expect.poll(() => island.dataset.direction).toBe(isLeft ? 'right' : 'left')
    expect(icon.style.transform).toBe(`rotate(${isLeft ? 90 : 270}deg)`)
    settings.controlsIslandIconSize = 'large'
    await expect.poll(() => main.querySelector('.size-5')).not.toBeNull()
    await page.viewport(600, 300)
    await screen.getByLabelText(i18n.global.t('tamagotchi.stage.controls-island.expand'), { exact: true }).click()
    expect(screen.getByTestId('controls-menu').element()).toBe(menu)
    expect(menu.closest('[inert]')).toBeNull()
    expect(icon.style.transform).toBe(`rotate(${isLeft ? 270 : 90}deg)`)
    await page.viewport(600, 600)
    await expect.poll(() => island.dataset.direction).toBe(isTop ? 'down' : 'up')
    expect(screen.getByTestId('controls-menu').element()).toBe(menu)
    const settingsButton = screen.getByLabelText(i18n.global.t('tamagotchi.stage.controls-island.open-settings'), { exact: true }).element() as HTMLElement
    settingsButton.focus()
    isOutside.value = true
    await expect.poll(() => toggle.getAttribute('aria-expanded'), { timeout: 3500 }).toBe('false')
    expect(document.activeElement).toBe(toggle)
    await expect.poll(() => island.offsetHeight === main.offsetHeight).toBe(true)
    expect(menu.closest('[inert]')).not.toBeNull()
  })
}

// https://github.com/moeru-ai/airi/pull/2474
it('assigns sideways overflow to the necessary menu axes without nested scrolling (PR #2474)', async () => {
  await page.viewport(600, 600)
  const { i18n, screen } = mountControlsIsland('top-left', 'small')
  await screen.getByLabelText(i18n.global.t('tamagotchi.stage.controls-island.expand'), { exact: true }).click()
  const island = screen.getByTestId('controls-island').element() as HTMLElement
  const main = screen.getByTestId('main-controls').element() as HTMLElement
  const menu = screen.getByTestId('controls-menu').element() as HTMLElement
  const content = menu.querySelector<HTMLElement>('.w-max')!
  const viewport = menu.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')!
  const outer = island.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')!
  await expect.poll(() => scrollOwners(island)).toHaveLength(0)
  // Extra auth-row spacing exercises content growth with native layout intact.
  const login = menu.querySelector<HTMLButtonElement>('button')!
  login.style.paddingBlock = '3rem'
  await expect.poll(() => content.offsetHeight).toBeGreaterThan(main.offsetHeight + 20)
  const menuHeight = content.offsetHeight
  const narrowWidth = main.offsetWidth + 12 + content.offsetWidth - 20 + 16
  for (const [width, height, horizontal, vertical] of [
    [600, menuHeight + 16, false, false],
    [narrowWidth, menuHeight + 16, true, false],
    [600, menuHeight + 6, false, true],
    [narrowWidth, menuHeight + 6, true, true],
  ] as const) {
    await page.viewport(width, height)
    await expect.poll(() => island.dataset.direction).toBe('right')
    await expect.poll(() => viewport.scrollWidth > viewport.clientWidth).toBe(horizontal)
    await expect.poll(() => viewport.scrollHeight > viewport.clientHeight).toBe(vertical)
    await expect.poll(() => outer.scrollWidth === outer.clientWidth).toBe(true)
    await expect.poll(() => outer.scrollHeight === outer.clientHeight).toBe(true)
    viewport.scrollTo(viewport.scrollWidth, viewport.scrollHeight)
    await nextTick()
    if (horizontal)
      expect(viewport.scrollLeft).toBeGreaterThan(0)
    if (vertical)
      expect(viewport.scrollTop).toBeGreaterThan(0)
  }
})
