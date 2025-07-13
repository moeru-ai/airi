import type { Theme } from 'vitepress'

import EmbedIframe from '../components/EmbedIframe.vue'
import Layout from '../custom/Layout.vue'

import '@unocss/reset/tailwind.css'
import 'uno.css'
import './style.css'

export default {
  // extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('EmbedIframe', EmbedIframe)
  },
} satisfies Theme
