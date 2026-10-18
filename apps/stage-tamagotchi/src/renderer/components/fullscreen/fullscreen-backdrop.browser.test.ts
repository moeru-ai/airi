import type { BackdropRegion } from '@proj-airi/electron-native-backdrop/types'

import type { WindowBackdropStatus } from '../../../shared/eventa'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent, useTemplateRef } from 'vue'

import FullscreenBackdrop from './fullscreen-backdrop.vue'

import { provideFullscreenLayout } from '../../composables/use-fullscreen-layout'
import { useWindowBackdrop } from '../../composables/use-window-backdrop'

import 'virtual:uno.css'

const { update } = vi.hoisted(() => ({
  update: vi.fn<(request: { regions: BackdropRegion[] }) => Promise<WindowBackdropStatus>>(),
}))

vi.mock('@proj-airi/electron-vueuse', () => ({ useElectronEventaInvoke: () => update }))

const views: { unmount: () => void }[] = []
const originalClass = document.documentElement.className

afterEach(async () => {
  views.splice(0).forEach(view => view.unmount())
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  document.documentElement.className = originalClass
  update.mockReset()
})

async function renderFullscreen() {
  const view = await render(defineComponent({
    components: { FullscreenBackdrop },
    setup() {
      const { surfaceWidth, surfaceMargin, surfaceRadius } = provideFullscreenLayout()
      useWindowBackdrop(useTemplateRef<HTMLElement>('background'), 'panel')
      return { surfaceWidth, surfaceMargin, surfaceRadius }
    },
    template: `
      <div data-testid="fullscreen-host" style="position:fixed;inset:0;background:rgb(255,0,255)">
        <FullscreenBackdrop />
        <div :style="{ position:'absolute', width:surfaceWidth + 'px', top:surfaceMargin + 'px', right:surfaceMargin + 'px', bottom:0 }">
          <div data-window-backdrop-panel-frame class="h-full w-full overflow-hidden" :style="{ borderTopLeftRadius:surfaceRadius, borderTopRightRadius:surfaceRadius }">
            <div ref="background" data-testid="chat-background" data-window-backdrop-surface class="h-full w-full"></div>
          </div>
        </div>
      </div>
    `,
  }))
  views.push(view)
  return {
    host: view.container.querySelector<HTMLElement>('[data-testid="fullscreen-host"]')!,
    background: view.container.querySelector<HTMLElement>('[data-testid="chat-background"]')!,
  }
}

async function screenshotPixels(element: HTMLElement) {
  const screenshot = await page.screenshot({ element, save: false })
  const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${screenshot}`)).blob())
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const scale = canvas.width / element.getBoundingClientRect().width
  return (x: number, y: number) => [...context.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data]
}

describe('fullscreen background native material opening', () => {
  it.each(['light', 'dark'] as const)('opens only the rounded chat area through the %s host background after native success', async (theme) => {
    await page.viewport(1000, 700)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    let acknowledge: ((status: WindowBackdropStatus) => void) | undefined
    update.mockImplementationOnce(() => new Promise(resolve => acknowledge = resolve))
    update.mockResolvedValue({ state: 'active' })
    const { host, background } = await renderFullscreen()
    await expect.poll(() => update.mock.calls.length).toBe(1)
    const rect = background.getBoundingClientRect()
    const opaque = theme === 'light' ? [245, 245, 245, 255] : [23, 23, 23, 255]
    const exposed = [255, 0, 255, 255]
    const before = await screenshotPixels(host)
    expect(before(rect.x + rect.width / 2, rect.y + 60)).toEqual(opaque)

    acknowledge!({ state: 'active' })
    await expect.poll(() => background.getAttribute('data-window-backdrop-active')).toBe('panel')
    const after = await screenshotPixels(host)
    expect(after(8, window.innerHeight / 2)).toEqual(opaque)
    expect(after(window.innerWidth - 8, window.innerHeight / 2)).toEqual(opaque)
    expect(after(rect.x + rect.width / 2, 8)).toEqual(opaque)
    expect(after(rect.x + 1, rect.y + 1)).toEqual(opaque)
    expect(after(rect.right - 1, rect.y + 1)).toEqual(opaque)
    expect(after(rect.x + 22, rect.y + 12)).toEqual(exposed)
    expect(after(rect.x + rect.width / 2, rect.y + 60)).toEqual(exposed)
    expect(after(rect.x + 1, rect.bottom - 2)).toEqual(exposed)

    background.style.display = 'none'
    await expect.poll(() => background.hasAttribute('data-window-backdrop-active')).toBe(false)
    const hidden = await screenshotPixels(host)
    expect(hidden(rect.x + rect.width / 2, rect.y + 60)).toEqual(opaque)
  })
})
