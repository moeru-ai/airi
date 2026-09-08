import en from '@proj-airi/i18n/locales/en'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { effectScope } from 'vue'
import { createI18n } from 'vue-i18n'

import HoloCoupon from './holo-coupon.vue'

import { useAnnouncements } from '../../../composables/announcements'

const announcement = {
  id: 'notice-1',
  locale: 'en',
  title: 'AIRI update',
  body: '<b>Plain text</b>',
  actionLabel: 'Read more',
  actionUrl: 'https://airi.build/',
  startsAt: '2026-01-01T00:00:00Z',
  endsAt: '',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function mount() {
  return render(HoloCoupon, {
    props: { client: 'desktop' },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('cloud announcement display', () => {
  it('uses the generated request and renders plain text with a safe external link', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ announcements: [announcement] }))
    vi.stubGlobal('fetch', fetch)
    await mount()
    await page.getByRole('button', { name: 'Open announcements' }).click()
    await expect.element(page.getByRole('heading', { name: 'AIRI update' })).toBeVisible()
    await expect.element(page.getByText('<b>Plain text</b>')).toBeVisible()
    await expect.element(page.getByRole('link', { name: 'Read more' })).toHaveAttribute('rel', 'noopener noreferrer')
    const request = fetch.mock.calls[0]?.[0]
    expect(request).toBeInstanceOf(Request)
    if (!(request instanceof Request))
      throw new Error('Expected the generated client to send a Request')
    expect(new URL(request.url).searchParams.get('client')).toBe('desktop')
    expect(request.credentials).toBe('omit')
    await page.getByRole('button', { name: 'Close announcements' }).click()
    await expect.element(page.getByRole('heading', { name: 'AIRI update' })).not.toBeInTheDocument()
  })

  it('clears loaded content on expiry, invalid actions, and failed refreshes', async () => {
    let payload = { ...announcement }
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ announcements: [payload] }))
    vi.stubGlobal('fetch', fetch)
    const scope = effectScope()
    const state = scope.run(() => useAnnouncements('web', 'en'))
    if (!state)
      throw new Error('Expected an active scope')
    try {
      await state.refresh()
      expect(state.announcements.value).toHaveLength(1)
      payload = { ...announcement, endsAt: '2026-01-02T00:00:00Z' }
      await state.refresh()
      expect(state.announcements.value).toHaveLength(0)
      expect(state.error.value).toBeNull()
      payload = { ...announcement, actionUrl: 'javascript:alert(1)' }
      await state.refresh()
      expect(state.announcements.value).toHaveLength(0)
      expect(state.error.value).toBeInstanceOf(Error)
      payload = announcement
      await state.refresh()
      expect(state.announcements.value).toHaveLength(1)
      fetch.mockRejectedValueOnce(new Error('Network unavailable'))
      await state.refresh()
      expect(state.announcements.value).toHaveLength(0)
      expect(state.error.value).toBeInstanceOf(Error)
    }
    finally {
      scope.stop()
    }
  })
})
