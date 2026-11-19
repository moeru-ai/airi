import type { BackdropRegion } from '@proj-airi/electron-native-backdrop/types'
import type { Component } from 'vue'

import type { WindowBackdropStatus } from '../../shared/eventa'

import { backdropSurfaceHostKey, useBackdropSurface } from '@proj-airi/stage-ui/composables/backdrop-surface'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, shallowRef, useTemplateRef } from 'vue'

import { createWindowBackdropHost } from './window-backdrop'

import 'virtual:uno.css'

const update = vi.fn<(request: { regions: BackdropRegion[] }) => Promise<WindowBackdropStatus>>()
const host = createWindowBackdropHost(update)

/** One declared glass surface, as a component declares it with `useBackdropSurface`. */
const Surface = defineComponent({
  props: { enabled: { type: Boolean, default: true } },
  setup(props) {
    useBackdropSurface(useTemplateRef<HTMLElement>('root'), { enabled: () => props.enabled })
  },
  template: '<div ref="root" data-surface><slot /></div>',
})

const views: { unmount: () => void }[] = []

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

async function mount(component: Component) {
  const view = await render(component, { global: { components: { Surface }, provide: { [backdropSurfaceHostKey as symbol]: host } } })
  views.push(view)
  return view
}

/** Mounts a fixed 300 by 250 root at (20, 30). A `page` root is a surface itself, like a chat page background. */
async function mountSurface(content: string, options: { page?: boolean, style?: string } = {}) {
  const tag = options.page ? 'Surface' : 'div'
  const view = await mount(defineComponent({
    template: `<${tag} style="position:fixed;left:20px;top:30px;width:300px;height:250px;${options.style ?? ''}">${content}</${tag}>`,
  }))
  return view.container.firstElementChild as HTMLElement
}

function regions() {
  return update.mock.calls.at(-1)?.[0].regions ?? []
}

beforeEach(() => {
  update.mockReset()
  update.mockResolvedValue({ state: 'active' })
})

afterEach(async () => {
  for (const view of views.splice(0))
    view.unmount()
  await nextFrame()
  await nextFrame()
})

describe('window native backdrop', () => {
  it('draws one region for a page surface and leaves its header, bubble, and composer fills alone', async () => {
    let acknowledge: ((status: WindowBackdropStatus) => void) | undefined
    update.mockImplementationOnce(() => new Promise(resolve => acknowledge = resolve))
    const root = await mountSurface(`
      <header class="bg-white" style="height:40px">Chat header</header>
      <div class="chat-message-item-container bg-neutral-100" style="margin-top:20px;width:180px;height:60px;border-radius:12px">Message</div>
      <div class="bg-neutral-900" style="margin-top:30px;height:50px;border-radius:16px">Composer</div>
    `, { page: true, style: 'border-radius:24px' })
    await expect.poll(() => update.mock.calls.length).toBe(1)
    expect(regions()).toHaveLength(1)
    expect(regions()[0]).toMatchObject({ x: 20, y: 30, width: 300, height: 250, radius: 24 })
    expect(getComputedStyle(root).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    const colors = [...root.children].map(child => getComputedStyle(child).backgroundColor)
    expect(colors).toEqual(['rgb(255, 255, 255)', 'rgb(245, 245, 245)', 'rgb(23, 23, 23)'])

    acknowledge!({ state: 'active' })
    await nextFrame()
    // Native glass draws only the material. Each element keeps its own fill.
    expect(getComputedStyle(root).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect([...root.children].map(child => getComputedStyle(child).backgroundColor)).toEqual(colors)
    expect(regions()).toHaveLength(1)
    const bubble = root.children[1] as HTMLElement
    bubble.style.opacity = '0'
    await nextFrame()
    await nextFrame()
    expect(regions()[0].opacity).toBe(1)
    root.style.display = 'none'
    await expect.poll(() => regions()).toEqual([])
  })

  it('sends one region for each surface, keeps gaps out of the regions, and leaves fills alone', async () => {
    let acknowledge: ((status: WindowBackdropStatus) => void) | undefined
    update.mockImplementationOnce(() => new Promise(resolve => acknowledge = resolve))
    const root = await mountSurface(`
      <Surface class="bg-white" style="width:100px;height:40px;border-radius:20px"></Surface>
      <Surface class="bg-neutral-100" style="margin-top:20px;width:180px;height:80px;border-radius:16px"></Surface>
    `)
    const surface = root.children[0] as HTMLElement
    await expect.poll(() => update.mock.calls.length).toBe(1)
    expect(regions().map(({ x, y, width, height, radius }) => ({ x, y, width, height, radius }))).toEqual([
      { x: 20, y: 30, width: 100, height: 40, radius: 20 },
      { x: 20, y: 90, width: 180, height: 80, radius: 16 },
    ])
    acknowledge!({ state: 'active' })
    await nextFrame()
    expect(getComputedStyle(surface).backgroundColor).toBe('rgb(255, 255, 255)')
    const calls = update.mock.calls.length
    await nextFrame()
    await nextFrame()
    expect(update.mock.calls.length).toBe(calls)
  })

  it('keeps the surface bounds through scroll and fold clips, and multiplies ancestor opacity', async () => {
    const root = await mountSurface(`
      <div data-fold style="width:300px;height:250px;clip-path:inset(10% 20% 0 0 round 24px);opacity:.5">
        <div data-scroll style="position:absolute;left:10px;top:20px;width:200px;height:120px;overflow:auto;border-radius:12px">
          <div style="height:300px;opacity:.5">
            <Surface class="bg-white" style="height:80px;width:180px;border-radius:16px;opacity:.8"></Surface>
          </div>
        </div>
      </div>
    `)
    await expect.poll(() => regions().length).toBe(1)
    const before = regions()[0]
    expect(before.x).toBe(30)
    expect(before.y).toBe(50)
    expect(before.radius).toBe(16)
    expect(before.opacity).toBe(0.2)
    expect(before.clips).toContainEqual({ x: 30, y: 50, width: 200, height: 120, radius: 12 })
    expect(before.clips).toContainEqual({ x: 20, y: 55, width: 240, height: 225, radius: 24 })
    const scroll = root.querySelector<HTMLElement>('[data-scroll]')!
    scroll.scrollTop = 40
    await expect.poll(() => regions()[0]?.y).toBe(10)
    expect(regions()[0].height).toBe(80)
    expect(regions()[0].radius).toBe(16)
    expect(regions()[0].clips).toContainEqual({ x: 30, y: 50, width: 200, height: 120, radius: 12 })
    root.querySelector<HTMLElement>('[data-fold]')!.style.opacity = '0'
    await expect.poll(() => regions()).toEqual([])
  })

  it('accepts exponent lengths that Chromium computes near the end of a fold transition', async () => {
    await mountSurface(`
      <div style="width:300px;height:250px;clip-path:inset(7.23473e-05% 0px 0px 7.23473e-05% round 24px)">
        <Surface class="bg-white" style="width:300px;height:250px"></Surface>
      </div>
    `)
    await expect.poll(() => regions().length).toBe(1)
    expect(regions()[0].clips).toContainEqual({ x: 20, y: 30, width: 300, height: 250, radius: 24 })
  })

  it('tracks transforms and opacity for the complete surface animation, then removes hidden content', async () => {
    const root = await mountSurface('<Surface class="bg-white" style="width:100px;height:40px;border-radius:20px"></Surface>')
    await expect.poll(() => regions().length).toBe(1)
    const surface = root.firstElementChild as HTMLElement
    surface.animate([
      { transform: 'translateY(0) scale(1)', opacity: 1 },
      { transform: 'translateY(60px) scale(.8)', opacity: 0.25 },
    ], { duration: 300, fill: 'forwards' })
    // Web Animations has no animationstart event. A layout invalidation also discovers active animations.
    surface.style.willChange = 'transform'
    await expect.poll(() => regions()[0]?.width).toBe(80)
    // Linux Chromium lays out the scaled end frame at 93.99. The y position depends on platform subpixel rounding.
    expect(regions()[0].y).toBeCloseTo(94, 1)
    expect(regions()[0].radius).toBe(16)
    expect(regions()[0].opacity).toBe(0.25)
    surface.style.display = 'none'
    await expect.poll(() => regions()).toEqual([])
  })

  it.each(['width', 'height'] as const)('keeps material through a zero-%s opening, closing, and reopening clip transition', async (dimension) => {
    // An overflow ancestor opens from an empty clipping area, then closes back to it.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const view = await mount(defineComponent({
        template: `
          <div style="position:fixed;left:20px;top:30px;width:${dimension === 'width' ? 0 : 300}px;height:${dimension === 'height' ? 0 : 250}px;overflow:hidden">
            <div style="width:300px;height:250px">
              <Surface class="bg-neutral-50" style="width:240px;height:160px" />
            </div>
          </div>
        `,
      }))
      const area = view.container.firstElementChild as HTMLElement
      const extent = dimension === 'width' ? 300 : 250
      const areaClip = (region: BackdropRegion) => region.clips.find(clip => clip.x === 20 && clip.y === 30 && clip.radius === 0 && (dimension === 'width' ? clip.height === 250 : clip.width === 300))
      await expect.poll(() => update.mock.calls.length).toBe(1)
      expect(regions()).toEqual([])
      expect(error).not.toHaveBeenCalled()

      area.style.transition = `${dimension} 240ms linear`
      area.getBoundingClientRect()
      area.style[dimension] = `${extent}px`
      await expect.poll(() => regions()[0] && areaClip(regions()[0])?.[dimension]).toBe(extent)
      expect(update.mock.calls.some(([request]) => request.regions.some((region) => {
        const clip = areaClip(region)
        return clip !== undefined && clip[dimension] > 0 && clip[dimension] < extent
      }))).toBe(true)

      area.style[dimension] = '0px'
      await expect.poll(() => area.getBoundingClientRect()[dimension]).toBe(0)
      await expect.poll(() => regions()).toEqual([])

      area.style[dimension] = `${extent}px`
      await expect.poll(() => regions()[0] && areaClip(regions()[0])?.[dimension]).toBe(extent)
      expect(error).not.toHaveBeenCalled()
    }
    finally {
      error.mockRestore()
    }
  })

  it('normalizes rounded-full radii before scaling fractional capsule dimensions', async () => {
    const root = await mountSurface('<Surface class="bg-white" style="width:100.5px;height:40.25px;border-radius:9999px;transform:scale(.94)"></Surface>')
    const surface = root.firstElementChild as HTMLElement
    const rect = surface.getBoundingClientRect()
    await expect.poll(() => regions().length).toBe(1)
    expect(regions()[0].width).toBeCloseTo(rect.width, 1)
    expect(regions()[0].height).toBeCloseTo(rect.height, 1)
    expect(regions()[0].radius).toBeCloseTo(rect.height / 2, 1)
  })

  it('coalesces changing geometry behind one invoke and sends empty regions after unmount', async () => {
    const acknowledgements: ((status: WindowBackdropStatus) => void)[] = []
    update.mockImplementation(() => new Promise(resolve => acknowledgements.push(resolve)))
    const root = await mountSurface('<Surface style="width:100px;height:40px;border-radius:20px"></Surface>')
    await expect.poll(() => update.mock.calls.length).toBe(1)
    const surface = root.firstElementChild as HTMLElement
    surface.style.width = '150px'
    await nextFrame()
    await nextFrame()
    surface.style.width = '190px'
    await nextFrame()
    await nextFrame()
    expect(update.mock.calls.length).toBe(1)
    acknowledgements.shift()!({ state: 'active' })
    await expect.poll(() => update.mock.calls.length).toBe(2)
    expect(regions()[0].width).toBe(190)
    views.splice(0).forEach(view => view.unmount())
    expect(update.mock.calls.length).toBe(2)
    acknowledgements.shift()!({ state: 'active' })
    await expect.poll(() => update.mock.calls.length).toBe(3)
    expect(regions()).toEqual([])
    acknowledgements.shift()!({ state: 'active' })
  })

  it('combines concurrent surfaces in one window and removes only the unmounted surface', async () => {
    await mountSurface('<Surface style="width:100px;height:40px"></Surface>')
    await expect.poll(() => regions().length).toBe(1)
    await mountSurface('', { page: true, style: 'left:400px' })
    await expect.poll(() => regions().length).toBe(2)
    expect(new Set(regions().map(region => region.id)).size).toBe(2)
    views.shift()!.unmount()
    await expect.poll(() => regions().length).toBe(1)
    expect(regions()[0].x).toBe(400)
  })

  it('clears a surface that turns off while mounted, and draws it again once it turns on', async () => {
    const enabled = shallowRef(true)
    await mount(defineComponent({
      setup: () => ({ enabled }),
      template: `<Surface :enabled="enabled" style="position:fixed;left:20px;top:30px;width:300px;height:250px" />`,
    }))
    await expect.poll(() => regions()).toHaveLength(1)

    enabled.value = false
    await expect.poll(() => regions()).toEqual([])

    enabled.value = true
    await expect.poll(() => regions()).toHaveLength(1)
  })

  it('clears native regions after a failure, without retrying on later mutations', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const root = await mountSurface('<Surface class="bg-white" style="width:100px;height:40px"></Surface>')
      await expect.poll(() => regions()).toHaveLength(1)
      update.mockResolvedValueOnce({ state: 'failed', reason: 'Native layer failed' })
      const surface = root.firstElementChild as HTMLElement
      surface.style.width = '110px'
      await expect.poll(() => error.mock.calls.length).toBe(1)
      await expect.poll(() => regions()).toEqual([])
      expect(error).toHaveBeenCalledWith('[window-backdrop] Native material stopped. Surfaces keep their own fill:', expect.objectContaining({ message: 'Native layer failed' }))
      const calls = update.mock.calls.length
      surface.style.width = '140px'
      await nextFrame()
      await nextFrame()
      expect(update.mock.calls.length).toBe(calls)
    }
    finally {
      error.mockRestore()
    }
  })

  it('stops sending regions when the platform does not support native material', async () => {
    update.mockResolvedValue({ state: 'unsupported', reason: 'Not macOS' })
    const root = await mountSurface('<Surface class="bg-white" style="width:100px;height:40px"></Surface>')
    await expect.poll(() => update.mock.calls.length).toBe(1)
    root.style.width = '320px'
    await nextFrame()
    await nextFrame()
    expect(update.mock.calls.length).toBe(1)
  })

  it('stays stopped when an older active reply arrives after a geometry failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const root = await mountSurface('<Surface class="bg-white" style="width:100px;height:40px"></Surface>')
      await expect.poll(() => regions()).toHaveLength(1)
      let acknowledge: ((status: WindowBackdropStatus) => void) | undefined
      update.mockImplementationOnce(() => new Promise(resolve => acknowledge = resolve))
      const surface = root.firstElementChild as HTMLElement
      surface.style.width = '110px'
      await expect.poll(() => update.mock.calls.length).toBe(2)
      surface.style.clipPath = 'polygon(0 0, 100% 0, 100% 100%)'
      await expect.poll(() => error.mock.calls.length).toBe(1)
      expect(update.mock.calls.length).toBe(2)
      acknowledge!({ state: 'active' })
      await expect.poll(() => update.mock.calls.length).toBe(3)
      expect(regions()).toEqual([])
      // The late reply does not restart the session. Later geometry changes send nothing.
      surface.style.clipPath = 'none'
      surface.style.width = '140px'
      await nextFrame()
      await nextFrame()
      expect(update.mock.calls.length).toBe(3)
      expect(error).toHaveBeenCalledWith('[window-backdrop] Native material stopped. Surfaces keep their own fill:', expect.objectContaining({ message: 'Unsupported backdrop clip-path: polygon(0px 0px, 100% 0px, 100% 100%)' }))
    }
    finally {
      error.mockRestore()
    }
  })
})
