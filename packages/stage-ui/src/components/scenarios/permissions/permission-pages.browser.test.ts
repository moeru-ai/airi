import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import BlockedPage from './blocked-page.vue'
import PermissionPageLayout from './permission-page-layout.vue'
import PermissionSummary from './permission-summary.vue'

describe('permission pages', () => {
  // ROOT CAUSE:
  //
  // A template comment before the root made the page a fragment in dev builds.
  // The `out-in` transition of the flow needs one element, so it stopped, and every page after Next was blank.
  it.each([
    ['page layout', () => render(PermissionPageLayout, { props: { title: 'Title', description: 'Description' } })],
    ['summary', () => render(PermissionSummary, {
      props: { items: [] },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })],
    ['blocked page', () => render(BlockedPage, {
      props: { page: 'Voiceprint', requirement: 'Microphone', icon: 'i-mingcute:voice-line' },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })],
  ])('renders the %s as one element, so the flow transition can animate it', (_, renderPage) => {
    const screen = renderPage()

    expect([...screen.container.childNodes].map(node => node.nodeType)).toEqual([Node.ELEMENT_NODE])
  })
})
