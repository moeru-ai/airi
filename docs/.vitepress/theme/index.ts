import type { Theme } from 'vitepress'

import messages from '@proj-airi/i18n/locales'

import { createI18n } from 'vue-i18n'

import Layout from '../custom/Layout.vue'

import '@unocss/reset/tailwind.css'
import 'uno.css'
import './style.css'
import './theme-vitepress.css'
import './theme-markdown.css'
import './theme-media.css'
import './theme-kbd.css'
import './theme-animations.css'
import './custom-nixie.css'
import '@fontsource-variable/quicksand'
import '@fontsource-variable/dm-sans'
import '@fontsource/dm-mono'
import '@fontsource/dm-serif-display'
import '@fontsource-variable/comfortaa'

export default {
  Layout,
  enhanceApp({ app, siteData }) {
    if (!import.meta.env.SSR && import.meta.env.PROD) {
      import('../modules/posthog')
    }

    const i18n = createI18n({
      legacy: false,
      locale: siteData.value.lang || 'en',
      fallbackLocale: 'en',
      messages,
    })

    app.use(i18n)
  },
} satisfies Theme
