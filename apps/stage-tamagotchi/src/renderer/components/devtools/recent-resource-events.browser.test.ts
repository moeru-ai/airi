import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import RecentResourceEvents from './recent-resource-events.vue'

// https://github.com/moeru-ai/airi/issues/2055
// The Performance Visualizer kept recent VRM resource events in
// resourceSnapshots.history but rendered only the history entry count.
// The new section shows the stored events, newest first.
describe('recent resource events (Issue #2055)', () => {
  it('shows stored events newest first with renderer and scene counts', async () => {
    const screen = await render(RecentResourceEvents, {
      props: {
        events: [
          {
            phase: 'after-load',
            reason: 'initial-load',
            rendererMemory: { calls: 10, geometries: 2, lines: 0, points: 0, textures: 4, triangles: 100 },
            sceneSummary: { animationActionCount: 1, materialCount: 3, meshCount: 5, sceneChildCount: 7, skinnedMeshCount: 1, textureRefCount: 4 },
            ts: 100,
          },
          {
            phase: 'before-dispose',
            reason: 'model-switch',
            rendererMemory: { calls: 12, geometries: 3, lines: 0, points: 0, textures: 6, triangles: 120 },
            sceneSummary: { animationActionCount: 1, materialCount: 4, meshCount: 6, sceneChildCount: 8, skinnedMeshCount: 1, textureRefCount: 6 },
            ts: 200,
          },
        ],
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    const rows = screen.container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
    // Newest event first: ts 200 before ts 100.
    expect(rows[0]?.querySelector('td')?.textContent).toBe('200.00')
    expect(rows[1]?.querySelector('td')?.textContent).toBe('100.00')
    expect(rows[0]?.textContent).toContain('before-dispose')
    expect(rows[0]?.textContent).toContain('model-switch')
    expect(screen.container.querySelectorAll('thead th')).toHaveLength(7)
  })

  it('shows an empty state when no events were recorded', async () => {
    const screen = await render(RecentResourceEvents, {
      props: { events: [] },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    await expect.element(screen.getByText('No resource events recorded yet.', { exact: true })).toBeVisible()
    expect(screen.container.querySelector('table')).toBeNull()
  })

  it('renders n/a for unavailable values without inventing data', async () => {
    const screen = await render(RecentResourceEvents, {
      props: { events: [{ phase: 'after-dispose', ts: 300 }] },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    const row = screen.container.querySelector('tbody tr')
    expect(row?.textContent).toContain('after-dispose')
    expect(row?.textContent).toContain('n/a')
    expect(row?.textContent).not.toContain('undefined')
  })
})
