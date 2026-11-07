import en from '@proj-airi/i18n/locales/en'

import { Badge } from '@proj-airi/ui'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import InboxPanel from './inbox-panel.vue'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

describe('unread badges', () => {
  it('caps a large count at 99+ and renders a dot without a number', async () => {
    const count = render(Badge, { props: { count: 12345 } })
    await expect.element(count.getByText('99+')).toBeInTheDocument()
    expect(count.container.textContent).not.toContain('12345')

    const dot = render(Badge, { props: { count: 12345, dot: true } })
    const element = dot.container.querySelector('[data-badge="dot"]')
    expect(element).not.toBeNull()
    expect(element?.textContent).toBe('')
  })

  it('caps the panel header count at 99+', async () => {
    const screen = render(InboxPanel, {
      props: { messages: [], now: new Date('2026-10-18T10:00:00Z'), unread: 12345 },
      global: { plugins: [i18n] },
    })

    const heading = screen.getByRole('heading', { name: /Notifications/ })
    await expect.element(heading).toHaveTextContent('99+')
    expect(heading.element().textContent).not.toContain('12345')
  })
})
