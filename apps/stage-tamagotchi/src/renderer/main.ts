import type { Plugin } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

import Tres from '@tresjs/core'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import { setupLayouts } from 'virtual:generated-layouts'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import App from './App.vue'
import BrowserApp from './BrowserApp.vue'

import { i18n } from './modules/i18n'

import '@unocss/reset/tailwind.css'
import 'splitpanes/dist/splitpanes.css'
import 'vue-sonner/style.css'
import './styles/main.css'
import 'uno.css'
// Fonts
import '@proj-airi/font-cjkfonts-allseto/index.css'
import '@proj-airi/font-xiaolai/index.css'
import '@fontsource-variable/dm-sans/index.css'
import '@fontsource-variable/jura/index.css'
import '@fontsource-variable/quicksand/index.css'
import '@fontsource-variable/urbanist/index.css'
import '@fontsource-variable/comfortaa/index.css'
import '@fontsource/dm-mono/index.css'
import '@fontsource/dm-serif-display/index.css'
import '@fontsource/gugi/index.css'
import '@fontsource/kiwi-maru/index.css'
import '@fontsource/m-plus-rounded-1c/index.css'
import '@fontsource-variable/nunito/index.css'

const pinia = createPinia()
const hasElectronRuntime = typeof window !== 'undefined' && !!window.electron?.ipcRenderer

const router = createRouter({
  history: createWebHashHistory(),
  // TODO: vite-plugin-vue-layouts is long deprecated, replace with another layout solution
  routes: setupLayouts(routes as RouteRecordRaw[]),
})

// NOTICE: the phone entry is served by the tamagotchi renderer through a normal browser.
// Mount a browser-safe root whenever Electron preload APIs are unavailable.
createApp(hasElectronRuntime ? App : BrowserApp)
  .use(MotionPlugin)
  // TODO: Fix autoAnimatePlugin type error
  .use(autoAnimatePlugin as unknown as Plugin)
  .use(router)
  .use(pinia)
  .use(i18n)
  .use(Tres)
  .mount('#app')

if (hasElectronRuntime) {
  void setupElectronScreenCaptureForVisualChat()
}

async function setupElectronScreenCaptureForVisualChat() {
  try {
    const { useVisualChatStore } = await import('@proj-airi/stage-ui/stores/modules/visual-chat')
    const { setupElectronScreenCapture } = await import('@proj-airi/electron-screen-capture/renderer')
    const { createContext } = await import('@moeru/eventa/adapters/electron/renderer')

    const ctx = createContext(window.electron!.ipcRenderer).context
    const screenCaptureApi = setupElectronScreenCapture(ctx)
    const store = useVisualChatStore(pinia)

    store.setScreenCaptureProvider(async () => {
      return screenCaptureApi.selectWithSource(
        (sources) => {
          const screen = sources.find(s => s.id.startsWith('screen:'))
          if (!screen)
            throw new Error('No screen source found for capture')
          return screen.id
        },
        () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }),
        { sourcesOptions: { types: ['screen', 'window'] } },
      )
    })
  }
  catch {
    // Electron screen capture setup failed; fallback to standard getDisplayMedia
  }
}
