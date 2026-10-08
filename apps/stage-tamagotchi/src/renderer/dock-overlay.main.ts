import { setupSynced } from '@proj-airi/stage-ui/libs/pinia'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import DockOverlayApp from './dock-overlay-app.vue'

import { resolveRendererWindowContext } from './window-context'

import '@unocss/reset/tailwind.css'
import './styles/hue.css'
import './styles/main.css'
import 'uno.css'

// The overlay follows the synchronized stores of the main window, for example the selected stage model.
// The main process loads this page with `synced-leader=false`.
const pinia = createPinia()
const synced = setupSynced({
  leadership: resolveRendererWindowContext().leadership,
})
pinia.use(synced.pinia)

createApp(DockOverlayApp)
  .use(synced.vue)
  .use(pinia)
  .mount('#app')
