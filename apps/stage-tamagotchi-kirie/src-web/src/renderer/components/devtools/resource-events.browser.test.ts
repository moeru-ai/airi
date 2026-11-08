import type { StageThreeRuntimeResourceSnapshotRecord } from '../../stores/stage-three-runtime-diagnostics'

import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ResourceEvents from './resource-events.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

function renderEvents(snapshots: readonly StageThreeRuntimeResourceSnapshotRecord[]) {
  return render(ResourceEvents, {
    props: { snapshots },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('recent resource events', () => {
  // https://github.com/moeru-ai/airi/issues/2055
  it('shows receipt order without sorting source clocks or changing history (Issue #2055)', async () => {
    const snapshots: readonly StageThreeRuntimeResourceSnapshotRecord[] = Object.freeze([
      { ts: 5000.125, phase: 'after-load', reason: 'initial-load' },
      { ts: 2000, phase: 'before-dispose', reason: 'model-switch' },
      { ts: 2000, phase: 'after-dispose', reason: 'model-switch' },
    ])
    const screen = await renderEvents(snapshots)
    const table = screen.getByRole('table', { name: 'Recent resource events' }).element()
    const rows = Array.from(table.querySelectorAll('tbody tr'))

    expect(rows.map(row => row.children[1].textContent?.trim())).toEqual([
      'after-dispose',
      'before-dispose',
      'after-load',
    ])
    expect(rows.map(row => row.children[0].textContent?.trim())).toEqual(['2000.00', '2000.00', '5000.13'])
    expect(snapshots.map(snapshot => snapshot.phase)).toEqual(['after-load', 'before-dispose', 'after-dispose'])
  })

  it('distinguishes zero resources from unavailable snapshots', async () => {
    const screen = await renderEvents([
      { ts: 0, phase: 'before-dispose' },
      {
        ts: 10,
        phase: 'after-dispose',
        reason: 'component-unmount',
        rendererMemory: { calls: 0, geometries: 0, lines: 0, points: 0, textures: 0, triangles: 0 },
        sceneSummary: {
          animationActionCount: 0,
          materialCount: 0,
          meshCount: 0,
          sceneChildCount: 0,
          skinnedMeshCount: 0,
          textureRefCount: 0,
        },
      },
    ])
    const rows = screen.getByRole('table').element().querySelectorAll('tbody tr')

    expect(Array.from(rows[0].children, cell => cell.textContent?.trim())).toEqual([
      '10.00',
      'after-dispose',
      'component-unmount',
      '0',
      '0',
      '0',
      '0',
    ])
    expect(Array.from(rows[1].children, cell => cell.textContent?.trim())).toEqual([
      '0.00',
      'before-dispose',
      'n/a',
      'n/a',
      'n/a',
      'n/a',
      'n/a',
    ])
  })

  it('updates the history and returns to the empty state when tracing resets', async () => {
    const screen = await renderEvents([])
    const emptyMessage = screen.getByText('No resource events recorded. Load or switch a VRM model while tracing is enabled.')
    await expect.element(emptyMessage).toBeVisible()

    await screen.rerender({ snapshots: [{ ts: 42, phase: 'after-load', reason: 'manual-reload' }] })
    await expect.element(screen.getByRole('cell', { name: 'manual-reload', exact: true })).toBeVisible()
    await expect.element(screen.getByRole('region', { name: 'Recent resource events' })).toHaveAttribute('tabindex', '0')

    await screen.rerender({ snapshots: [] })
    await expect.element(emptyMessage).toBeVisible()
    await expect.element(screen.getByRole('table')).not.toBeInTheDocument()
  })
})
