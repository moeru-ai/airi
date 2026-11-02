import { beginSpan } from '@proj-airi/trace-kit'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import IOTracerDevtools from './io-tracer-devtools.vue'

import { getTraceSink, getTraceSource } from '../../../composables/use-trace'
import { useIOTracerStore } from '../../../stores/devtools/io-tracer'

describe('io tracer page', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
  })

  afterEach(() => {
    cleanup()
    disposePinia(pinia)
  })

  async function renderPage() {
    // The workbench sizes its panels from its container, so the page needs a desktop viewport and a height.
    await page.viewport(1440, 900)
    document.body.style.height = '900px'
    return render(IOTracerDevtools, {
      container: document.body.appendChild(Object.assign(document.createElement('div'), { style: 'height: 900px' })),
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })] },
    })
  }

  // The tests find the parts as assistive technology does: by role and accessible name.
  type Screen = Awaited<ReturnType<typeof renderPage>>
  const timelineOf = (screen: Screen) => screen.getByRole('group', { name: /^Timeline\./ })
  // The canvas draws the items. Its hidden item list names each item, for screen readers and for these tests.
  const itemsOf = (screen: Screen) => screen.getByRole('list', { name: 'Timeline items' })
  const detailOf = (screen: Screen) => screen.getByRole('complementary', { name: 'Details' })
  // The canvas has no role, because the item list is its accessible form. The tests find it inside the timeline.
  const canvasOf = (screen: Screen) => timelineOf(screen).element().querySelector('canvas')!

  it('shows an open span while it runs, and its details on click', async () => {
    const screen = await renderPage()
    const span = beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'open-model-request', ids: { turn: 'turn-1' } })

    const item = itemsOf(screen).getByRole('button', { name: /open-model-request · thinking · running/ })
    await expect.element(item).toBeInTheDocument()

    ;(item.element() as HTMLElement).click()
    await expect.element(detailOf(screen).getByText('agents/agent/llm')).toBeVisible()

    span.end()
    await expect.element(itemsOf(screen).getByRole('button', { name: /open-model-request · thinking · [\d.]+ (?:ms|s)/ })).toBeInTheDocument()
  })

  it('shows a link as a card that selects its target', async () => {
    const screen = await renderPage()
    const cause = beginSpan(getTraceSink(), { track: 'participants/user/input', name: 'linked-voice-input' })
    cause.end()
    beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'linked-request', links: [{ rel: 'caused-by', to: { spanId: cause.spanId } }] }).end()

    const item = itemsOf(screen).getByRole('button', { name: /linked-request/ })
    await expect.element(item).toBeInTheDocument()
    ;(item.element() as HTMLElement).click()

    // The card names the target span and its track, so the panel does not show a raw span ID.
    const card = detailOf(screen).getByRole('button', { name: /linked-voice-input/ })
    await expect.element(card).toHaveTextContent(/linked-voice-input.*participants\/user\/input/)
    ;(card.element() as HTMLElement).click()
    await expect.element(detailOf(screen).getByText('Linked from')).toBeVisible()
  })

  it('moves between a span and its parent from the details', async () => {
    const screen = await renderPage()
    const parent = beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'nesting-request' })
    beginSpan(getTraceSink(), { track: 'agents/agent/tools', name: 'nesting-tool', parent }).end()
    parent.end()

    const item = itemsOf(screen).getByRole('button', { name: /nesting-tool/ })
    await expect.element(item).toBeInTheDocument()
    ;(item.element() as HTMLElement).click()

    const detail = detailOf(screen)
    const parentCard = detail.getByRole('group', { name: 'Parent' }).getByRole('button')
    const childrenButton = detail.getByRole('group', { name: 'Children' }).getByRole('button')
    await expect.element(parentCard).toHaveTextContent(/nesting-request/)
    ;(parentCard.element() as HTMLElement).click()

    // The parent lists its child, and a click goes back down.
    await expect.element(childrenButton).toHaveTextContent('nesting-tool')
    ;(childrenButton.element() as HTMLElement).click()
    await expect.element(parentCard).toBeVisible()
  })

  it('clears the selection on a click on an empty part of the timeline', async () => {
    const screen = await renderPage()
    beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'deselected-request' }).end()

    const item = itemsOf(screen).getByRole('button', { name: /deselected-request/ })
    await expect.element(item).toBeInTheDocument()
    ;(item.element() as HTMLElement).click()
    await expect.element(detailOf(screen)).toBeVisible()

    // The bottom of the canvas has no rows, so the click hits no item.
    const canvas = canvasOf(screen)
    const rect = canvas.getBoundingClientRect()
    const point = { clientX: rect.left + rect.width / 2, clientY: rect.bottom - 4, button: 0, bubbles: true }
    canvas.dispatchEvent(new PointerEvent('pointerdown', point))
    canvas.dispatchEvent(new PointerEvent('pointerup', point))
    await expect.element(detailOf(screen)).not.toBeInTheDocument()
  })

  it('drags the cursor on the axis', async () => {
    const screen = await renderPage()
    beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'scrubbed-request' }).end()
    await expect.element(itemsOf(screen).getByRole('button', { name: /scrubbed-request/ })).toBeInTheDocument()

    const slider = screen.getByRole('slider', { name: 'Cursor' })
    const axis = slider.element()
    const rect = axis.getBoundingClientRect()
    // The mouse pointer has ID 1, so the axis can capture it.
    const at = (x: number) => ({ clientX: rect.left + x, clientY: rect.top + 4, button: 0, pointerId: 1, bubbles: true })
    axis.dispatchEvent(new PointerEvent('pointerdown', at(rect.width / 2)))
    const status = timelineOf(screen).getByRole('status')
    await expect.element(status).toHaveTextContent(/Cursor at/)
    // The slider tells assistive technology the same cursor time.
    await expect.element(slider).toHaveAttribute('aria-valuetext', status.element().textContent!.replace('Cursor at', '').trim())
    const pressed = status.element().textContent

    axis.dispatchEvent(new PointerEvent('pointermove', at(rect.width - 20)))
    await expect.poll(() => status.element().textContent).not.toBe(pressed)
    axis.dispatchEvent(new PointerEvent('pointerup', at(rect.width - 20)))
  })

  it('moves the cursor with the keyboard, and clears it with Escape', async () => {
    const screen = await renderPage()
    beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'keyed-request' }).end()
    await expect.element(itemsOf(screen).getByRole('button', { name: /keyed-request/ })).toBeInTheDocument()

    const timeline = timelineOf(screen).element() as HTMLElement
    const status = timelineOf(screen).getByRole('status')
    timeline.focus()
    const press = (key: string, options: KeyboardEventInit = {}) => timeline.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))

    press('Home')
    await expect.element(status).toHaveTextContent(/Cursor at/)
    const atStart = status.element().textContent
    press('ArrowRight', { shiftKey: true })
    await expect.poll(() => status.element().textContent).not.toBe(atStart)
    press('ArrowLeft', { shiftKey: true })
    press('ArrowLeft', { shiftKey: true })
    // The cursor stops at the start of the trace.
    await expect.poll(() => status.element().textContent).toBe(atStart)

    press('Escape')
    await expect.poll(() => status.element().textContent?.trim()).toBe('')
  })

  it('moves the selection between items with arrow keys', async () => {
    const screen = await renderPage()
    const sink = getTraceSink()
    beginSpan(sink, { track: 'agents/agent/tools', name: 'first-tool' }).end()
    await new Promise(resolve => setTimeout(resolve, 5))
    beginSpan(sink, { track: 'agents/agent/tools', name: 'second-tool' }).end()

    const items = itemsOf(screen)
    const first = items.getByRole('button', { name: /first-tool/ })
    await expect.element(items.getByRole('button', { name: /second-tool/ })).toBeInTheDocument()
    // Tab reaches one item only.
    expect(items.element().querySelectorAll('button[tabindex="0"]')).toHaveLength(1)

    const firstButton = first.element() as HTMLButtonElement
    firstButton.focus()
    firstButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    const detail = detailOf(screen)
    await expect.element(detail.getByText('second-tool').first()).toBeVisible()
    expect(document.activeElement?.textContent).toMatch(/second-tool/)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await expect.element(detail).not.toBeInTheDocument()
    expect(document.activeElement).toBe(timelineOf(screen).element())
  })

  it('resizes the label column from its edge', async () => {
    localStorage.removeItem('ui/devtools/io-tracer/label-width')
    const screen = await renderPage()
    const edge = screen.getByRole('separator', { name: 'Resize the track labels' }).element()
    // The edge sits inside the label column that it resizes.
    const labels = edge.parentElement!
    await expect.poll(() => labels.offsetWidth).toBe(208)

    const rect = edge.getBoundingClientRect()
    const at = (x: number) => ({ clientX: x, clientY: rect.top + 40, button: 0, pointerId: 1, bubbles: true })
    edge.dispatchEvent(new PointerEvent('pointerdown', at(rect.left)))
    edge.dispatchEvent(new PointerEvent('pointermove', at(rect.left + 100)))
    edge.dispatchEvent(new PointerEvent('pointerup', at(rect.left + 100)))
    await expect.poll(() => labels.offsetWidth).toBe(308)

    // The width has limits, and a double click resets it.
    edge.dispatchEvent(new PointerEvent('pointerdown', at(rect.left)))
    edge.dispatchEvent(new PointerEvent('pointermove', at(rect.left - 500)))
    edge.dispatchEvent(new PointerEvent('pointerup', at(rect.left - 500)))
    await expect.poll(() => labels.offsetWidth).toBe(140)
    edge.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await expect.poll(() => labels.offsetWidth).toBe(208)
    localStorage.removeItem('ui/devtools/io-tracer/label-width')
  })

  it('lists records in the event log', async () => {
    const screen = await renderPage()
    beginSpan(getTraceSink(), { track: 'participants/user/asr', name: 'logged-recognition' }).end({ status: 'error', message: 'provider failed' })

    // The event log is a panel next to the timeline, so the record shows without switching views.
    await expect.element(screen.getByText('logged-recognition').first()).toBeVisible()
    await expect.element(screen.getByText('error').first()).toBeVisible()
  })

  it('shows the detail rows of a lane without a click', async () => {
    const screen = await renderPage()
    beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'expanded-request', ids: { turn: 'turn-2' } }).end()

    // Only a detail row lists its spans, so the span is listed when its lane shows its rows.
    await expect.element(itemsOf(screen).getByRole('button', { name: /expanded-request/ })).toBeInTheDocument()
  })

  it('hides a track from its label, and keeps the label to show it again', async () => {
    const screen = await renderPage()
    beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'hidden-request', ids: { turn: 'turn-3' } }).end()
    const listed = () => itemsOf(screen).getByRole('button', { name: /hidden-request/ }).elements().length
    await expect.poll(listed).toBe(1)

    // The view updates every 50 ms while records arrive, so the row is never stable for the actionability check. A forced
    // pointer click did not reach it in the test runner, so the test clicks the row element itself.
    const visibility = screen.getByTitle('agents/agent/llm', { exact: true }).getByRole('button')
    ;(visibility.element() as HTMLElement).click()

    await expect.poll(listed).toBe(0)
    // A hidden track keeps its records in the event log. The log is a virtual list, and the test layout gives it no
    // height, so the test reads the log data.
    expect(useIOTracerStore(pinia).eventLogView().entries.some(entry => entry.record.type === 'span.begin' && entry.record.name === 'hidden-request')).toBe(true)
    await expect.element(visibility).toHaveAttribute('aria-pressed', 'false')

    ;(visibility.element() as HTMLElement).click()
    await expect.poll(listed).toBe(1)
  })

  it('wants a track that appears after the user hid another track, so its producer keeps sending', async () => {
    const screen = await renderPage()
    beginSpan(getTraceSink(), { track: 'participants/user/input', name: 'early-input' }).end()
    await expect.poll(() => itemsOf(screen).getByRole('button', { name: /early-input/ }).elements().length).toBe(1)

    ;(screen.getByTitle('participants/user/input', { exact: true }).getByRole('button').element() as HTMLElement).click()
    await expect.poll(() => getTraceSource().wants('participants/user/input')).toBe(false)

    // The first playback track appears only now. A producer of its series checks `wants` before it sends.
    beginSpan(getTraceSink(), { track: 'participants/agent/playback', name: 'first-clip' }).end()
    await expect.poll(() => itemsOf(screen).getByRole('button', { name: /first-clip/ }).elements().length).toBe(1)
    await expect.poll(() => getTraceSource().wants('participants/agent/playback')).toBe(true)
  })

  it('starts from now: drops the records so far and keeps recording', async () => {
    const screen = await renderPage()
    beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'before-start', ids: { turn: 'turn-4' } }).end()
    await expect.element(screen.getByText('before-start').first()).toBeVisible()

    // NOTICE:
    // A locator click never passes its checks in a Dockview panel here, so the test clicks the element.
    // Root cause: not confirmed. The button is stable in Histoire and in the app.
    // Source: this file, the follow test too.
    // Removal condition: a locator click passes in Dockview panels.
    ;(screen.getByRole('button', { name: 'tamagotchi.settings.devtools.pages.io-tracer.actions.start-from-now', exact: true }).element() as HTMLButtonElement).click()
    beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'after-start', ids: { turn: 'turn-5' } }).end()

    await expect.element(screen.getByText('after-start').first()).toBeVisible()
    expect(screen.getByText('before-start').elements()).toHaveLength(0)
  })

  it('holds the now line while paused', async () => {
    const store = useIOTracerStore(pinia)
    await renderPage()
    beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'before-pause', ids: { turn: 'turn-6' } }).end()
    await expect.poll(() => store.traceNow()).toBeDefined()

    store.stop()
    const pausedAt = store.traceNow()
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(store.traceNow()).toBe(pausedAt)
  })

  it('stops following when the user zooms, and does not follow while paused', async () => {
    const store = useIOTracerStore(pinia)
    const screen = await renderPage()
    beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'followed', ids: { turn: 'turn-8' } }).end()
    const followButton = screen.getByRole('button', { name: /toggles\.follow/ })
    await expect.element(followButton).toHaveAttribute('aria-pressed', 'true')

    // A zoom keeps the view that the user chose, so follow mode turns off and stays off.
    canvasOf(screen).dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }))
    await expect.element(followButton).toHaveAttribute('aria-pressed', 'false')

    // A locator click fails in Dockview panels here. See the NOTICE of the start-from-now test.
    ;(followButton.element() as HTMLButtonElement).click()
    await expect.element(followButton).toHaveAttribute('aria-pressed', 'true')
    // A paused trace has a still clock, so follow mode cannot move the view.
    store.stop()
    await expect.element(followButton).toHaveAttribute('aria-pressed', 'false')
    await expect.element(followButton).toBeDisabled()
  })

  it('draws the items on the canvas', async () => {
    const screen = await renderPage()
    beginSpan(getTraceSink(), { track: 'agents/agent/llm', name: 'drawn-request', ids: { turn: 'turn-7' } }).end()
    await expect.element(itemsOf(screen).getByRole('button', { name: /drawn-request/ })).toBeInTheDocument()

    const canvas = canvasOf(screen)
    await expect.poll(() => {
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let painted = 0
      for (let index = 3; index < pixels.length; index += 4)
        painted += pixels[index]! > 0 ? 1 : 0
      return painted
    }).toBeGreaterThan(100)
  })
})
