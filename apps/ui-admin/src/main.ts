import NProgress from 'nprogress'

import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { Toaster } from 'vue-sonner'

import App from './App.vue'
import FluxPage from './pages/FluxPage.vue'
import LlmRouterPage from './pages/LlmRouterPage.vue'
import OverviewPage from './pages/OverviewPage.vue'
import UsersPage from './pages/UsersPage.vue'
import VoicePackFormPage from './pages/VoicePackFormPage.vue'
import VoicePacksPage from './pages/VoicePacksPage.vue'

import '@proj-airi/font-chillroundm/index.css'
import '@unocss/reset/tailwind.css'
import 'vue-sonner/style.css'
import './styles/main.css'
import 'uno.css'

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes: [
    { path: '/', component: OverviewPage },
    { path: '/users', component: UsersPage },
    { path: '/flux', component: FluxPage },
    { path: '/llm-router', component: LlmRouterPage },
    { path: '/voice-packs', component: VoicePacksPage },
    { path: '/voice-packs/new', name: 'voice-pack-new', component: VoicePackFormPage },
    { path: '/voice-packs/:id/edit', name: 'voice-pack-edit', component: VoicePackFormPage },
  ],
})

router.beforeEach((to, from) => {
  if (to.path !== from.path)
    NProgress.start()
})

router.afterEach(() => {
  NProgress.done()
})

createApp(App)
  .use(createPinia())
  .use(router)
  .component('Toaster', Toaster)
  .mount('#app')
