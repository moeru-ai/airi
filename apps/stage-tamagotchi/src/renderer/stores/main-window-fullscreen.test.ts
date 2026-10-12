import type { RouteRecordRaw } from 'vue-router'

import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { electronMainWindowFullscreenSurfaceChanged } from '../../shared/eventa'
import { nestFullscreenSurfaces } from '../components/fullscreen/surfaces'
import { useMainWindowFullscreenStore } from './main-window-fullscreen'

const mocks = vi.hoisted(() => ({
  reportSurface: vi.fn(async () => {}),
}))

// The fullscreen mode tells the main process only what shows. Any other call fails here.
vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (event: unknown) => {
    if (event === electronMainWindowFullscreenSurfaceChanged)
      return mocks.reportSurface
    throw new Error('Unexpected invoke')
  },
}))

const Page = defineComponent({ render: () => null })

/** The app routes after `setupLayouts`: the main page in the stage layout, and settings pages in the settings layout. */
function appRoutes(): RouteRecordRaw[] {
  return [
    { path: '/', component: Page, children: [{ path: '/', component: Page }] },
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

/** The main window page: the store inside an app whose router nests the settings under the main page. */
async function setup(options: { startAt?: string } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: nestFullscreenSurfaces(appRoutes(), 'main-window') })
  await router.push(options.startAt ?? '/')
  const app = createApp(Page)
  app.use(router)
  app.use(createPinia())
  const fullscreen = app.runWithContext(() => useMainWindowFullscreenStore())
  return { router, fullscreen }
}

describe('main window fullscreen store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(mocks.reportSurface.mock.calls).toEqual([[{ surface: 'settings' }], [{ surface: 'chat' }], [{ surface: 'settings' }]])
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

  // After a chat mode switch moves the chat out, the settings that the user opened stay.
  it('removes a surface whose content moved away, and closes only when nothing is left', async () => {
    const { fullscreen } = await setup()
    await fullscreen.open('settings')
    fullscreen.settle('open')
    await fullscreen.open('chat')

    await fullscreen.dismiss('chat')

    expect(fullscreen.surface).toBe('settings')
    expect(fullscreen.phase).toBe('open')

    await fullscreen.dismiss('settings')

    expect(fullscreen.phase).toBe('closing')
  })

  it('shows the kept surface at once after a reload', async () => {
    const { router, fullscreen } = await setup({ startAt: '/settings/airi-card' })

    await fullscreen.resume('settings')

    expect(fullscreen.phase).toBe('open')
    expect(router.currentRoute.value.path).toBe('/settings/airi-card')
  })
})
