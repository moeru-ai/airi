import en from '@proj-airi/i18n/locales/en'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { effectScope } from 'vue'
import { createI18n } from 'vue-i18n'

import AnnouncementCarousel from './announcement-carousel.vue'
import HoloCoupon from './holo-coupon.vue'

import { useAnnouncements } from '../../../composables/announcements'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const announcement = {
  id: 'notice-1',
  locale: 'en',
  layout: 'portrait',
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

async function mount(onOpenChange = (_open: boolean) => {}) {
  return render(HoloCoupon, {
    props: { 'client': 'desktop', 'onUpdate:open': onOpenChange },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('cloud announcement display', () => {
  // https://github.com/moeru-ai/airi/pull/2484#discussion_r3980949680
  it('preserves the selected announcement when earlier entries disappear', async () => {
    // ROOT CAUSE:
    // A numeric selection points to another item when an earlier entry expires.
    // Preserve the announcement ID and resolve its new position after updates.
    const first = { ...announcement, layout: 'portrait' as const, coverUrl: '' }
    const second = { ...first, id: 'notice-2', title: 'Second announcement' }
    const third = { ...first, id: 'notice-3', title: 'Third announcement' }
    const screen = await render(AnnouncementCarousel, {
      props: { items: [first, second, third], mobile: true },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
    await page.getByRole('button', { name: second.title, exact: true }).click()
    await expect.element(page.getByRole('heading', { name: second.title })).toBeVisible()
    await screen.rerender({ items: [second, third] })
    await expect.element(page.getByRole('heading', { name: second.title })).toBeVisible()
    await expect.element(page.getByRole('button', { name: second.title, exact: true })).toHaveAttribute('aria-current', 'true')
    await screen.rerender({ items: [third, second] })
    await expect.element(page.getByRole('heading', { name: second.title })).toBeVisible()
    await screen.rerender({ items: [third] })
    await expect.element(page.getByRole('heading', { name: third.title })).toBeVisible()
  })

  it('opens the mobile drawer and restores the selected announcement after closing', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => Response.json({ announcements: [
      announcement,
      { ...announcement, id: 'notice-2', layout: 'landscape', title: 'Second announcement' },
    ] })))
    await render(HoloCoupon, {
      props: { client: 'web', presentation: 'drawer' },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
    await page.getByRole('button', { name: 'Open announcements' }).click()
    await expect.element(page.getByRole('dialog', { name: 'Announcements', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Second announcement', exact: true }).click()
    await expect.element(page.getByRole('heading', { name: 'Second announcement' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
    await page.getByRole('button', { name: 'Open announcements' }).click()
    await expect.element(page.getByRole('heading', { name: 'Second announcement' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Second announcement', exact: true })).toHaveAttribute('aria-current', 'true')
  })

  // https://github.com/moeru-ai/airi/pull/2484
  it('keeps controls in one row when Cloud returns 100 announcements', async () => {
    // ROOT CAUSE:
    // Wrapped indicators covered the fixed-height card text with up to 100 buttons.
    // Horizontal scrolling keeps every indicator reachable in one row.
    const entries = Array.from({ length: 100 }, (_, index) => ({
      ...announcement,
      id: `notice-${index}`,
      title: `Announcement ${index + 1}`,
    }))
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => Response.json({ announcements: entries })))
    await mount()
    await page.getByRole('button', { name: 'Open announcements' }).click()
    await expect.element(page.getByText('1/100', { exact: true })).toBeVisible()
    const controls = page.getByText('1/100', { exact: true }).element().parentElement!
    expect(controls.getBoundingClientRect().height).toBeLessThanOrEqual(32)
    await page.getByRole('button', { name: 'Announcement 100', exact: true }).click()
    await expect.element(page.getByRole('heading', { name: 'Announcement 100', exact: true })).toBeVisible()
  })

  it('advances automatically while publication expiry checks continue', async () => {
    // ROOT CAUSE:
    // The expiry clock updates the list every second. Watching that list with
    // Embla's shallow ref restarted autoplay before its five-second interval.
    // Watch the playback decision so unchanged eligibility keeps the timer.
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => Response.json({ announcements: [
      announcement,
      { ...announcement, id: 'notice-2', title: 'Second announcement' },
    ] })))
    await mount()
    await page.getByRole('button', { name: 'Open announcements' }).click()
    await expect.element(page.getByRole('heading', { name: 'AIRI update' })).toBeVisible()
    await page.getByRole('button', { name: 'Open announcements' }).hover()
    await expect.element(page.getByRole('heading', { name: 'Second announcement' }), { timeout: 8000 }).toBeVisible()
  }, 15000)

  it('cycles across multiple announcements and keeps text when a cover cannot load', async () => {
    const entries = [
      { ...announcement, coverUrl: '/v1/announcements/notice-1/cover?revision=2' },
      { ...announcement, id: 'notice-2', title: 'Second announcement' },
    ]
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => Response.json({ announcements: entries })))
    await mount()
    await page.getByRole('button', { name: 'Open announcements' }).click()
    await expect.element(page.getByRole('heading', { name: 'AIRI update' })).toBeVisible()
    await page.getByRole('button', { name: 'Second announcement', exact: true }).click()
    await expect.element(page.getByRole('heading', { name: 'Second announcement' })).toBeVisible()
    await page.getByRole('button', { name: 'AIRI update', exact: true }).click()
    await expect.element(page.getByRole('heading', { name: 'AIRI update' })).toBeVisible()
    await page.getByRole('button', { name: 'Second announcement', exact: true }).click()
    await expect.element(page.getByRole('heading', { name: 'Second announcement' })).toBeVisible()
    await page.getByRole('button', { name: 'AIRI update', exact: true }).click()
    await expect.element(page.getByRole('button', { name: 'AIRI update', exact: true })).toHaveAttribute('aria-current', 'true')
    await expect.element(page.getByRole('heading', { name: 'Second announcement' })).not.toBeInTheDocument()
    await page.getByRole('button', { name: 'Close announcements' }).click()
    await page.getByRole('button', { name: 'Open announcements' }).click()
    await expect.element(page.getByRole('heading', { name: 'AIRI update' })).toBeVisible()
  })

  it('resolves cover paths against Cloud and rejects an unrelated image origin', async () => {
    let coverUrl = '/v1/announcements/notice-1/cover?revision=2'
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => Response.json({ announcements: [{ ...announcement, coverUrl }] })))
    const scope = effectScope()
    const state = scope.run(() => useAnnouncements('web', 'en'))!
    try {
      await state.refresh()
      expect(new URL(state.announcements.value[0]!.coverUrl).pathname).toBe('/v1/announcements/notice-1/cover')
      coverUrl = 'https://untrusted.example/image.png'
      await state.refresh()
      expect(state.announcements.value).toHaveLength(0)
      expect(state.error.value).not.toBeNull()
    }
    finally { scope.stop() }
  })

  it('uses the generated request and renders plain text without an action button', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ announcements: [announcement] }))
    vi.stubGlobal('fetch', fetch)
    const onOpenChange = vi.fn<(open: boolean) => void>()
    await mount(onOpenChange)
    await page.getByRole('button', { name: 'Open announcements' }).click()
    await expect.element(page.getByRole('heading', { name: 'AIRI update' })).toBeVisible()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    await expect.element(page.getByText('<b>Plain text</b>')).toBeVisible()
    await expect.element(page.getByRole('link', { name: 'Read more' })).not.toBeInTheDocument()
    const request = fetch.mock.calls[0]?.[0]
    expect(request).toBeInstanceOf(Request)
    if (!(request instanceof Request))
      throw new Error('Expected the generated client to send a Request')
    expect(new URL(request.url).searchParams.get('client')).toBe('desktop')
    expect(request.credentials).toBe('omit')
    await page.getByRole('button', { name: 'Close announcements' }).click()
    await expect.element(page.getByRole('heading', { name: 'AIRI update' })).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('shows announcements when optional protobuf fields are omitted', async () => {
    // ROOT CAUSE:
    // Protobuf responses can omit empty strings. Requiring action and expiry
    // fields discarded valid no-action, non-expiring announcements.
    const { actionLabel, actionUrl, endsAt, ...content } = announcement
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => Response.json({ announcements: [content] })))
    await mount()
    await page.getByRole('button', { name: 'Open announcements' }).click()
    await expect.element(page.getByRole('heading', { name: 'AIRI update' })).toBeVisible()
    await expect.element(page.getByRole('link', { name: 'Read more' })).not.toBeInTheDocument()
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
