import type { RouteRecordRaw } from 'vue-router'

import type { FullscreenHost } from '../window-context'

import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { electronFullscreenSurfaceChanged } from '../../shared/eventa'
import { fullscreenHostPages, nestFullscreenSurfaces } from '../components/fullscreen/surfaces'
import { useFullscreenStore } from './fullscreen'

const mocks = vi.hoisted(() => ({
  reportSurface: vi.fn(async () => {}),
}))

// The fullscreen mode tells the main process only what shows. Any other call fails here.
vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (event: unknown) => {
    if (event === electronFullscreenSurfaceChanged)
      return mocks.reportSurface
    throw new Error('Unexpected invoke')
  },
}))

const Page = defineComponent({ render: () => null })

/**
 * The app routes after `setupLayouts`: the main page and the page of the `multi-window` mode in the stage layout, and
 * settings pages in the settings layout.
 */
function appRoutes(): RouteRecordRaw[] {
  return [
    { path: '/', component: Page, children: [{ path: '/', component: Page }] },
    { path: '/workspace', component: Page, children: [{ path: '', component: Page }] },
    {
      path: '/settings',
      children: [
        { path: '', component: Page, meta: { isLayout: true }, children: [{ path: '', component: Page, meta: { layout: 'settings' } }] },
        { path: 'airi-card', component: Page, meta: { isLayout: true }, children: [{ path: '', component: Page, meta: { layout: 'settings' } }] },
      ],
    },
    { path: '/chat', component: Page },
  ]
}

/** A host page: the store inside an app whose router nests the settings under the page of the host. */
async function setup(options: { startAt?: string, host?: FullscreenHost } = {}) {
  const host = options.host ?? 'main-window'
  // The store reads which host its window is from the query that the main process gives the window.
  vi.stubGlobal('location', { search: `?synced-leader=true&fullscreen-host=${host}` })
  const router = createRouter({ history: createMemoryHistory(), routes: nestFullscreenSurfaces(appRoutes(), host) })
  await router.push(options.startAt ?? fullscreenHostPages[host])
  const app = createApp(Page)
  app.use(router)
  app.use(createPinia())
  const fullscreen = app.runWithContext(() => useFullscreenStore())
  return { router, fullscreen }
}

describe('main window fullscreen store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  // A settings page that another window opens can always go back, because the settings home sits under it.
  it('opens a settings page with the settings home under it', async () => {
    const { router, fullscreen } = await setup()

    await fullscreen.open('settings', '/settings/airi-card')

    expect(router.currentRoute.value.path).toBe('/settings/airi-card')
    expect(fullscreen.phase).toBe('expanding')

    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings'))
  })

  // The main page stays mounted under a settings route, so the stage never leaves while the panel shows settings.
  it('keeps the main page in the matched routes of settings, and other pages apart', async () => {
    const { router } = await setup()

    expect(router.resolve('/settings/airi-card').matched.slice(0, 2).map(record => record.path)).toEqual(['/', '/'])
    expect(router.resolve('/chat').matched.map(record => record.path)).toEqual(['/chat'])
  })

  // Switching is not a navigation, so a page with unsaved changes never sees a leave, and each panel keeps its state.
  it('switches surfaces without leaving the settings page, and keeps both mounted', async () => {
    const { router, fullscreen } = await setup()
    await fullscreen.open('settings', '/settings/airi-card')
    fullscreen.settle('open')
    await fullscreen.open('chat')
    await fullscreen.open('settings')

    expect(router.currentRoute.value.path).toBe('/settings/airi-card')
    expect([...fullscreen.mounted]).toEqual(['settings', 'chat'])
    expect(mocks.reportSurface.mock.calls).toEqual([
      [{ surface: 'settings', mounted: ['settings'] }],
      [{ surface: 'chat', mounted: ['settings', 'chat'] }],
      [{ surface: 'settings', mounted: ['settings', 'chat'] }],
    ])
  })

  it('leaves the settings page through the router when it closes, and starts fresh after', async () => {
    const { router, fullscreen } = await setup()
    await fullscreen.open('settings', '/settings/airi-card')
    fullscreen.settle('open')

    await fullscreen.close()

    expect(router.currentRoute.value.path).toBe('/')
    expect(fullscreen.phase).toBe('closing')

    fullscreen.settle('closed')
    await fullscreen.open('settings')

    expect(router.currentRoute.value.path).toBe('/settings')
    expect([...fullscreen.mounted]).toEqual(['settings'])
  })

  // The card editor stops a leave while it has unsaved changes, and shows its dialog in the settings surface.
  it('stays open on settings when a settings page stops the leave', async () => {
    const { router, fullscreen } = await setup()
    await fullscreen.open('settings', '/settings/airi-card')
    fullscreen.settle('open')
    await fullscreen.open('chat')
    router.beforeEach((_, from) => from.path !== '/settings/airi-card')

    await fullscreen.close()

    expect(fullscreen.phase).toBe('open')
    expect(fullscreen.surface).toBe('settings')
    expect(router.currentRoute.value.path).toBe('/settings/airi-card')
  })

  it('shows the kept surface at once after a reload', async () => {
    const { router, fullscreen } = await setup({ startAt: '/settings/airi-card' })

    await fullscreen.resume('settings')

    expect(fullscreen.phase).toBe('open')
    expect(router.currentRoute.value.path).toBe('/settings/airi-card')
  })

  // The window of the `multi-window` mode shows the same settings pages, with its own page kept under them.
  it('nests the settings under the page of the window that hosts the mode', async () => {
    const { router } = await setup({ host: 'workspace-window' })

    expect(router.resolve('/settings/airi-card').matched.slice(0, 2).map(record => record.path)).toEqual(['/workspace', '/workspace'])
    expect(router.resolve('/').matched.map(record => record.path)).toEqual(['/', '/'])
  })

  // Closing leaves the settings pages for the page of the host, so that window keeps its own page.
  it('returns to the page of the host when the mode closes', async () => {
    const { router, fullscreen } = await setup({ host: 'workspace-window' })
    await fullscreen.open('settings', '/settings/airi-card')
    fullscreen.settle('open')

    await fullscreen.close()

    expect(router.currentRoute.value.path).toBe('/workspace')
    expect(fullscreen.phase).toBe('closing')
  })

  // A move between windows hands every mounted surface its own state, and the same surface stays in front.
  it('packs each mounted surface with its state, and the next host restores them', async () => {
    const { fullscreen } = await setup()
    await fullscreen.open('settings', '/settings/airi-card')
    fullscreen.settle('open')
    await fullscreen.open('chat')
    fullscreen.carry('settings', { collect: () => '/settings/airi-card', restore: () => {} })
    fullscreen.carry('chat', { collect: () => 'unsent draft', restore: () => {} })

    const packed = await fullscreen.pack()
    if (!packed)
      throw new Error('The open mode packed nothing')

    expect(packed).toEqual({ surface: 'chat', surfaces: [{ id: 'settings', state: '/settings/airi-card' }, { id: 'chat', state: 'unsent draft' }] })

    const next = await setup({ host: 'workspace-window' })
    await next.fullscreen.unpack(packed)
    const restore = vi.fn()
    next.fullscreen.carry('chat', { collect: () => undefined, restore })

    expect([...next.fullscreen.mounted]).toEqual(['settings', 'chat'])
    expect(next.fullscreen.surface).toBe('chat')
    expect(next.fullscreen.phase).toBe('expanding')
    await vi.waitFor(() => expect(restore).toHaveBeenCalledWith('unsent draft'))
  })

  // Only an open mode has surfaces to hand over.
  it('packs nothing while the mode is not open', async () => {
    const { fullscreen } = await setup()

    expect(await fullscreen.pack()).toBeUndefined()
  })

  // Turning the experiment off ends the mode from the chat first, and settings still move to the settings window.
  it('packs while the mode closes, because its panels stay mounted until the transition ends', async () => {
    const { fullscreen } = await setup()
    await fullscreen.open('settings', '/settings/airi-card')
    fullscreen.settle('open')
    fullscreen.carry('settings', { collect: () => '/settings/airi-card', restore: () => {} })

    await fullscreen.close()

    expect(fullscreen.phase).toBe('closing')
    expect(await fullscreen.pack()).toEqual({ surface: 'settings', surfaces: [{ id: 'settings', state: '/settings/airi-card' }] })
  })

  // A second move can come before the chat panel of the first one mounts. The draft still travels with it.
  it('packs a state that still waits for its panel to mount', async () => {
    const { fullscreen } = await setup({ host: 'workspace-window' })
    await fullscreen.unpack({ surface: 'chat', surfaces: [{ id: 'chat', state: 'unsent draft' }] })
    fullscreen.settle('open')

    expect(await fullscreen.pack()).toEqual({ surface: 'chat', surfaces: [{ id: 'chat', state: 'unsent draft' }] })
  })

  // Switching back during the close transition must not let the old close clear the surfaces that just moved in.
  it('opens a pack that arrives while the mode closes once the close ends', async () => {
    const { fullscreen } = await setup()
    await fullscreen.open('settings')
    fullscreen.settle('open')
    await fullscreen.close()

    const unpacking = fullscreen.unpack({ surface: 'chat', surfaces: [{ id: 'chat', state: 'unsent draft' }] })
    expect(fullscreen.phase).toBe('closing')
    fullscreen.settle('closed')
    await unpacking

    expect(fullscreen.phase).toBe('expanding')
    expect([...fullscreen.mounted]).toEqual(['chat'])
    expect(fullscreen.surface).toBe('chat')
  })
})
