import type { Theme } from 'vitepress'

import messages from '@proj-airi/i18n/locales'

import { createI18n } from 'vue-i18n'

import Layout from '../custom/Layout.vue'

import '@unocss/reset/tailwind.css'
import 'uno.css'
import './nixie.css'
import './style.css'
import '@fontsource-variable/quicksand'
import '@fontsource-variable/dm-sans'
import '@fontsource/dm-mono'
import '@fontsource/dm-serif-display'
import '@fontsource-variable/comfortaa'

export default {
  Layout,
  enhanceApp({ app }) {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      fallbackLocale: 'en',
      messages,
    })

    app.use(i18n)
  },
} satisfies Theme
