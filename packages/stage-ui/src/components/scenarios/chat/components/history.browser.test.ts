import type { ChatHistoryItem } from '../../../../types/chat'

import en from '@proj-airi/i18n/locales/en'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import ChatHistory from './history.vue'

import { getChatHistoryItemKey } from '../utils'

const triggerHaptic = vi.fn()

vi.mock('web-haptics/vue', () => ({
  useWebHaptics: () => ({ trigger: triggerHaptic }),
}))

function createEnglishI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: { en },
  })
}

function dispatchPointerSwipe(element: HTMLElement, startX: number, endX: number, pointerType: 'mouse' | 'touch' = 'mouse') {
  element.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true,
    buttons: 1,
    clientX: startX,
    clientY: 60,
    pointerId: 1,
    pointerType,
    isPrimary: true,
  }))
  element.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true,
    buttons: 1,
    clientX: endX,
    clientY: 62,
    pointerId: 1,
    pointerType,
    isPrimary: true,
  }))
  element.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true,
    buttons: 0,
    clientX: endX,
    clientY: 62,
    pointerId: 1,
    pointerType,
    isPrimary: true,
  }))
}

let wheelEventTimeStamp = 0

function createWheelEvent(init: WheelEventInit) {
  const event = new WheelEvent('wheel', init)
  wheelEventTimeStamp += 16
  Object.defineProperty(event, 'timeStamp', { value: wheelEventTimeStamp })
  return event
}

function dispatchHorizontalPan(element: HTMLElement, deltaX: number) {
  let defaultPrevented = false
  for (const portion of [0.2, 0.25, 0.25, 0.3]) {
    const event = createWheelEvent({
      bubbles: true,
      cancelable: true,
      deltaX: deltaX * portion,
      deltaY: 2,
    })
    element.dispatchEvent(event)
    defaultPrevented ||= event.defaultPrevented
  }
  return defaultPrevented
}

function getTranslateX(element: HTMLElement) {
  const match = element.style.transform.match(/translate3d\((-?[\d.]+)px/)
  if (!match)
    throw new Error('Expected a pixel-based translate3d transform.')

  return Number(match[1])
}

function getExpectedLeftSwipeOffset(element: HTMLElement, distance: number) {
  const resistanceLength = element.clientWidth / 4
  return resistanceLength * Math.expm1(-distance / resistanceLength)
}

function dispatchTouchPointer(element: EventTarget, type: 'pointerdown' | 'pointermove', clientX: number) {
  element.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    buttons: 1,
    clientX,
    clientY: 60,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'touch',
  }))
}

function dispatchTouchEvent(
  element: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  clientX: number,
  clientY = 60,
) {
  const touch = new Touch({
    clientX,
    clientY,
    identifier: 1,
    target: element,
  })
  const activeTouches = type === 'touchend' || type === 'touchcancel' ? [] : [touch]

  element.dispatchEvent(new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    changedTouches: [touch],
    targetTouches: activeTouches,
    touches: activeTouches,
  }))
}

describe('chat history', () => {
  beforeEach(() => {
    triggerHaptic.mockClear()
  })

  it('renders a stored reply relation inside the message bubble', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Earlier answer',
            slices: [{ type: 'text', text: 'Earlier answer' }],
            tool_results: [],
          },
          {
            id: 'user-1',
            role: 'user',
            content: 'My follow-up',
            replyToMessageId: 'assistant-1',
          },
        ],
        style: 'height: 240px; width: 320px;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      const messageBubbles = Array.from(screen.container.querySelectorAll<HTMLElement>('.chat-message-item-container'))
      const replyBubble = messageBubbles.find(element => element.textContent?.includes('My follow-up'))
      expect(replyBubble?.textContent).toContain('Replying to AIRI')
      expect(replyBubble?.textContent).toContain('Earlier answer')
    })
  })

  // ROOT CAUSE:
  //
  // The desktop chat needs the styled Reka viewport, but forcing its track to
  // stay mounted leaves an inert scrollbar visible when short content cannot scroll.
  // Reka's automatic visibility must own the track without changing the viewport.
  it('uses a Reka viewport without showing a scrollbar for a short desktop chat', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [{ id: 'user-1', role: 'user', content: 'Hello' }],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('.chat-history-list')).not.toBeNull()
    })

    const history = screen.container.querySelector<HTMLElement>('.chat-history-list')
    expect(history).not.toBeNull()
    if (!history)
      throw new Error('Expected a chat history viewport.')

    const track = screen.container.querySelector<HTMLElement>('.scrollable-area-scrollbar--vertical')
    expect(history.matches('[data-reka-scroll-area-viewport]')).toBe(true)
    expect(track === null || track.dataset.state === 'hidden').toBe(true)
  })

  it('virtualizes long desktop history inside one Reka viewport', async () => {
    const messages: ChatHistoryItem[] = Array.from({ length: 100 }, (_, index) => ({
      id: `desktop-user-${index}`,
      role: 'user',
      content: `Desktop message ${index} `.repeat(index % 6 + 1),
      createdAt: index,
    }))

    const screen = await render(ChatHistory, {
      props: {
        messages,
        style: 'height: 240px; width: 320px;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      const renderedMessages = screen.container.querySelectorAll('.chat-message-item')
      expect(renderedMessages.length).toBeGreaterThan(0)
      expect(renderedMessages.length).toBeLessThan(messages.length)
    })

    const history = screen.container.querySelector<HTMLElement>('.chat-history-list')
    expect(history).not.toBeNull()
    if (!history)
      throw new Error('Expected a desktop chat history viewport.')

    expect(history.matches('[data-reka-scroll-area-viewport]')).toBe(true)
    expect(screen.container.querySelectorAll('.chat-history-list')).toHaveLength(1)
    await vi.waitFor(() => {
      expect(screen.container.querySelector('.scrollable-area-scrollbar--vertical')).not.toBeNull()
      expect(history.scrollHeight).toBeGreaterThan(history.clientHeight)
      expect(screen.container.textContent).toContain('Desktop message 99')
    })

    history.scrollTop = 0
    history.dispatchEvent(new Event('scroll'))

    await vi.waitFor(() => {
      expect(screen.container.textContent).toContain('Desktop message 0')
    })
  })

  // ROOT CAUSE:
  //
  // Virtua keeps its internal content root at least as tall as the viewport, but
  // absolutely positioned messages still start at the top. A short mobile history
  // therefore leaves most of the chat area empty below a newly sent message.
  //
  // We fixed this by bottom-aligning short virtualized content while preserving
  // the existing overflow direction for longer history.
  it('bottom-aligns a newly sent mobile message and its streaming placeholder', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [{ id: 'user-1', role: 'user', content: 'hello' }],
        sending: true,
        streamingMessage: {
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          slices: [],
          tool_results: [],
        },
        variant: 'mobile',
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('.chat-message-item-visible')).not.toBeNull()
    })

    const history = screen.container.querySelector<HTMLElement>('.chat-history-list')
    const messages = screen.container.querySelectorAll<HTMLElement>('.chat-message-item')
    expect(history).not.toBeNull()
    expect(messages).toHaveLength(2)
    if (!history || messages.length !== 2)
      throw new Error('Expected a sent message and its streaming placeholder.')

    const historyBottom = history.getBoundingClientRect().bottom
    expect(historyBottom - messages[1].getBoundingClientRect().bottom).toBeLessThanOrEqual(16)
    expect(historyBottom - messages[0].getBoundingClientRect().bottom).toBeLessThanOrEqual(64)
  })

  // ROOT CAUSE:
  //
  // Rendering every message keeps every backdrop-filter surface alive, even when
  // most of the history is outside the viewport. Long histories then cost more to
  // lay out and composite during fast mobile scrolling.
  //
  // We virtualize the history and mount only the viewport plus a small overscan area.
  it('virtualizes long histories and reveals messages inside the viewport', async () => {
    const messages: ChatHistoryItem[] = Array.from({ length: 100 }, (_, index) => ({
      id: `user-${index}`,
      role: 'user',
      content: `Message ${index} `.repeat(index % 6 + 1),
      createdAt: index,
    }))

    const screen = await render(ChatHistory, {
      props: {
        messages,
        variant: 'mobile',
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      const renderedMessages = screen.container.querySelectorAll('.chat-message-item')
      expect(renderedMessages.length).toBeGreaterThan(0)
      expect(renderedMessages.length).toBeLessThan(messages.length)
      expect(screen.container.textContent).toContain('Message 99')
    })

    await vi.waitFor(() => {
      const visibleMessages = screen.container.querySelectorAll('.chat-message-item-visible')
      const hiddenMessages = screen.container.querySelectorAll('.chat-message-item:not(.chat-message-item-visible)')

      expect(visibleMessages.length).toBeGreaterThan(0)
      expect(hiddenMessages.length).toBeGreaterThan(0)
      expect(visibleMessages[0].classList.contains('opacity-100')).toBe(true)
      expect(visibleMessages[0].classList.contains('transition-opacity')).toBe(true)
      expect(hiddenMessages[0].classList.contains('opacity-0')).toBe(true)
    })

    const history = screen.container.querySelector<HTMLElement>('.chat-history-list')
    expect(history).not.toBeNull()
    if (!history)
      throw new Error('Expected a chat history viewport.')

    expect(history.matches('[data-reka-scroll-area-viewport]')).toBe(false)
    expect(screen.container.querySelectorAll('.chat-history-list')).toHaveLength(1)
    await vi.waitFor(() => {
      expect(history.scrollHeight).toBeGreaterThan(history.clientHeight)
    })
    expect(getComputedStyle(history).overflowY).toBe('auto')
    expect(screen.container.querySelector('.scrollable-area-scrollbar--vertical')).toBeNull()

    history.scrollTop = 0
    history.dispatchEvent(new Event('scroll'))

    await vi.waitFor(() => {
      expect(screen.container.textContent).toContain('Message 0')
    })
  })

  it('keeps a stable mask on each mobile message container', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [{ role: 'user', content: 'hello' }],
        variant: 'mobile',
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('.chat-message-item-container')).not.toBeNull()
    })

    const messageContainer = screen.container.querySelector<HTMLElement>('.chat-message-item-container')
    expect(messageContainer).not.toBeNull()
    if (!messageContainer)
      throw new Error('Expected a mobile chat message container.')

    expect(getComputedStyle(messageContainer).maskImage).not.toBe('none')
    await vi.waitFor(() => {
      expect(messageContainer.closest('.chat-message-item-visible')).not.toBeNull()
    })
  })

  // ROOT CAUSE:
  //
  // Cross-window synchronization can publish `sending` before it publishes the new stream.
  // The initial stream object has a timestamp but no message id, which rendered a short-lived bubble.
  //
  // We fixed this by rendering only a stream that has the stable id assigned to the assistant turn.
  it('does not render the initial empty stream while a synchronized send starts', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [],
        sending: true,
        streamingMessage: {
          role: 'assistant',
          content: '',
          slices: [],
          tool_results: [],
          createdAt: 1710000000000,
        },
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    expect(screen.container.querySelectorAll('.chat-message-item')).toHaveLength(0)
  })

  it('emits retry-message when the retry button is clicked for an error after a user message', async () => {
    const messages: ChatHistoryItem[] = [
      { role: 'user', content: 'hello' },
      { role: 'error', content: 'Remote sent 400 response' },
    ]

    const screen = await render(ChatHistory, {
      props: {
        messages,
        style: 'height: 480px; width: 480px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await screen.getByRole('button', { name: 'Retry' }).click()

    expect(screen.emitted('retryMessage')).toEqual([[
      {
        message: messages[1],
        index: 1,
        key: getChatHistoryItemKey(messages[1], 1),
      },
    ]])
  })

  it('does not render the retry button when the error is not preceded by a user message', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [
          { role: 'assistant', content: 'hello', slices: [], tool_results: [] },
          { role: 'error', content: 'Remote sent 400 response' },
        ],
        style: 'height: 480px; width: 480px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    expect(screen.container.textContent).not.toContain('Retry')
  })

  it('selects every desktop message for reply with a two-finger horizontal pan', async () => {
    const messages: ChatHistoryItem[] = [
      {
        id: 'user-reply-target',
        role: 'user',
        content: 'My message',
      },
      {
        id: 'assistant-reply-target',
        role: 'assistant',
        content: 'A message from AIRI',
        slices: [],
        tool_results: [],
      },
    ]
    const screen = await render(ChatHistory, {
      props: {
        messages,
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelectorAll('[data-swipeable-surface]')).toHaveLength(2)
      expect(screen.container.querySelectorAll('[data-swipeable]')).toHaveLength(2)
    })

    const swipeSurfaces = screen.container.querySelectorAll<HTMLElement>('[data-swipeable-surface]')
    const swipeRoots = screen.container.querySelectorAll<HTMLElement>('[data-swipeable]')
    dispatchPointerSwipe(swipeSurfaces[0], 100, 40)
    dispatchPointerSwipe(swipeSurfaces[1], 100, 40)
    expect(screen.emitted('replyMessage')).toBeUndefined()

    const zoomEvent = createWheelEvent({
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaX: 60,
    })
    swipeRoots[0].dispatchEvent(zoomEvent)
    const verticalScrollEvents = [0.2, 0.25, 0.25, 0.3].map(portion => createWheelEvent({
      bubbles: true,
      cancelable: true,
      deltaX: 2 * portion,
      deltaY: 60 * portion,
    }))
    for (const event of verticalScrollEvents)
      swipeRoots[1].dispatchEvent(event)
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(screen.emitted('replyMessage')).toBeUndefined()
    expect(zoomEvent.defaultPrevented).toBe(false)
    for (const event of verticalScrollEvents)
      expect(event.defaultPrevented).toBe(false)

    expect(dispatchHorizontalPan(swipeRoots[0], -60)).toBe(false)
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(screen.emitted('replyMessage')).toBeUndefined()

    // The root fills the complete message row, so a pan can start beside the bubble.
    expect(dispatchHorizontalPan(swipeRoots[0], 60)).toBe(true)
    expect(dispatchHorizontalPan(swipeRoots[1], 60)).toBe(true)

    await vi.waitFor(() => {
      expect(screen.emitted('replyMessage')).toEqual([
        [{
          message: messages[0],
          label: 'You',
        }],
        [{
          message: messages[1],
          label: 'AIRI',
        }],
      ])
    })
  })

  // ROOT CAUSE:
  //
  // The first diagonal wheel event could have a slightly larger horizontal
  // delta. The gesture claimed that event as a reply swipe and prevented every
  // later event, even when the complete gesture was clearly vertical scrolling.
  //
  // The recognizer must wait for clear horizontal intent. It must lock a clear
  // vertical gesture out of reply handling for the rest of that wheel stream.
  it('keeps a diagonal vertical wheel stream available to chat scrolling', async () => {
    const message: ChatHistoryItem = {
      id: 'desktop-vertical-scroll-target',
      role: 'user',
      content: 'Vertical scroll target',
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeRoot || !swipeSurface)
      throw new Error('Expected a desktop message swipe surface.')

    const events = [
      createWheelEvent({ bubbles: true, cancelable: true, deltaX: 9, deltaY: 5 }),
      createWheelEvent({ bubbles: true, cancelable: true, deltaX: 0, deltaY: 20 }),
      createWheelEvent({ bubbles: true, cancelable: true, deltaX: 0, deltaY: 30 }),
    ]
    for (const event of events)
      swipeRoot.dispatchEvent(event)
    await nextTick()

    for (const event of events)
      expect(event.defaultPrevented).toBe(false)
    expect(swipeSurface.style.transform).toBe('translate3d(0px, 0px, 0px)')
    expect(screen.emitted('replyMessage')).toBeUndefined()
  })

  // ROOT CAUSE:
  //
  // The old recognizer committed on a fixed deadline after threshold entry.
  // Later input could still belong to the same direct two-finger pan, so the
  // reply activated before the user released the gesture.
  //
  // Velocity and event cadence adapt the ending window. The final position
  // decides whether the gesture commits.
  it('waits for the adaptive ending signal before committing a desktop reply', async () => {
    const message: ChatHistoryItem = {
      id: 'desktop-momentum-target',
      role: 'user',
      content: 'Momentum reply target',
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    if (!swipeRoot)
      throw new Error('Expected a desktop message swipe root.')

    dispatchHorizontalPan(swipeRoot, 60)
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(screen.emitted('replyMessage')).toBeUndefined()

    dispatchHorizontalPan(swipeRoot, 3)
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(screen.emitted('replyMessage')).toBeUndefined()

    await vi.waitFor(() => {
      expect(screen.emitted('replyMessage')).toEqual([[
        {
          message,
          label: 'You',
        },
      ]])
    })
  })

  // ROOT CAUSE:
  //
  // Waiting for the inertial wheel tail to become idle makes the message look
  // stuck after the fingers leave the trackpad. Those events no longer describe
  // a position that the user directly controls.
  //
  // Momentum detection ends direct manipulation immediately. The reply uses the
  // last direct position, while the same return animation consumes the tail.
  it('returns a desktop message as soon as the wheel stream becomes momentum', async () => {
    const message: ChatHistoryItem = {
      id: 'desktop-momentum-release-target',
      role: 'user',
      content: 'Momentum release target',
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeRoot || !swipeSurface)
      throw new Error('Expected a desktop message swipe surface.')

    const deceleratingDeltas = [10, 10, 8, 8, 6.4, 6.4, 5.12, 5.12, 4.096, 4.096, 3.2768, 3.2768, 2.62144]
    for (const deltaX of deceleratingDeltas) {
      swipeRoot.dispatchEvent(createWheelEvent({
        bubbles: true,
        cancelable: true,
        deltaX,
      }))
      await new Promise(resolve => requestAnimationFrame(resolve))
    }

    expect(swipeSurface.style.transform).not.toBe('translate3d(0px, 0px, 0px)')
    expect(screen.emitted('replyMessage')).toBeUndefined()

    swipeRoot.dispatchEvent(createWheelEvent({
      bubbles: true,
      cancelable: true,
      deltaX: 2.62144,
    }))

    expect(screen.emitted('replyMessage')).toEqual([[
      {
        message,
        label: 'You',
      },
    ]])
    await vi.waitFor(() => {
      expect(swipeSurface.style.transform).toBe('translate3d(0px, 0px, 0px)')
    })
  })

  // ROOT CAUSE:
  //
  // A hard offset clamp let raw wheel distance accumulate behind a stationary
  // message. Reversing the pan first consumed that hidden distance.
  //
  // The resistance curve maps each raw position. Reverse input moves the message
  // immediately, and the release position still decides commit.
  it('lets a desktop pan move back before release', async () => {
    const message: ChatHistoryItem = {
      id: 'desktop-momentum-return-target',
      role: 'user',
      content: 'Momentum return target',
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeRoot || !swipeSurface)
      throw new Error('Expected a desktop message swipe surface.')

    dispatchHorizontalPan(swipeRoot, 100)
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(getTranslateX(swipeSurface)).toBeCloseTo(getExpectedLeftSwipeOffset(swipeRoot, 100), 3)

    dispatchHorizontalPan(swipeRoot, -30)
    await new Promise(resolve => requestAnimationFrame(resolve))
    const reversedOffset = getExpectedLeftSwipeOffset(swipeRoot, 70)
    expect(getTranslateX(swipeSurface)).toBeCloseTo(reversedOffset, 3)

    await new Promise(resolve => setTimeout(resolve, 80))
    expect(getTranslateX(swipeSurface)).toBeCloseTo(reversedOffset, 3)
    expect(screen.emitted('replyMessage')).toBeUndefined()

    dispatchHorizontalPan(swipeRoot, -30)
    await new Promise(resolve => requestAnimationFrame(resolve))
    const releaseOffset = getExpectedLeftSwipeOffset(swipeRoot, 40)
    expect(getTranslateX(swipeSurface)).toBeCloseTo(releaseOffset, 3)

    await new Promise(resolve => setTimeout(resolve, 120))
    expect(getTranslateX(swipeSurface)).not.toBeCloseTo(releaseOffset, 3)
    expect(screen.emitted('replyMessage')).toBeUndefined()
  })

  // ROOT CAUSE:
  //
  // The recognizer tried to infer trackpad release from decreasing wheel
  // deltas. A user can also slow a direct pan before lifting their fingers, so
  // this inference started the return while the gesture was still active.
  //
  // Every direct event in a wheel stream must update the message position. The
  // adaptive ending signal releases the gesture and starts the return.
  it('follows every partial desktop pan delta until the wheel stream becomes idle', async () => {
    const message: ChatHistoryItem = {
      id: 'desktop-partial-pan-target',
      role: 'user',
      content: 'Partial pan reply target',
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable-surface]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeRoot || !swipeSurface)
      throw new Error('Expected a desktop message swipe surface.')

    for (const deltaX of [10, 10, 10]) {
      swipeRoot.dispatchEvent(createWheelEvent({
        bubbles: true,
        cancelable: true,
        deltaX,
        deltaY: 1,
      }))
      await new Promise(resolve => requestAnimationFrame(resolve))
    }
    expect(getTranslateX(swipeSurface)).toBeCloseTo(getExpectedLeftSwipeOffset(swipeRoot, 30), 3)

    const decayingDeltas = [6, 4, 2, 1]
    for (const [index, deltaX] of decayingDeltas.entries()) {
      swipeRoot.dispatchEvent(createWheelEvent({
        bubbles: true,
        cancelable: true,
        deltaX,
        deltaY: 1,
      }))
      if (index < decayingDeltas.length - 1)
        await new Promise(resolve => setTimeout(resolve, 20))
    }
    await new Promise(resolve => requestAnimationFrame(resolve))

    const heldOffset = getExpectedLeftSwipeOffset(swipeRoot, 43)
    expect(getTranslateX(swipeSurface)).toBeCloseTo(heldOffset, 3)
    expect(screen.emitted('replyMessage')).toBeUndefined()

    await new Promise(resolve => setTimeout(resolve, 80))
    expect(getTranslateX(swipeSurface)).toBeCloseTo(heldOffset, 3)

    await new Promise(resolve => setTimeout(resolve, 260))
    expect(swipeSurface.style.transform).toBe('translate3d(0px, 0px, 0px)')
    expect(screen.emitted('replyMessage')).toBeUndefined()
  })

  // ROOT CAUSE:
  //
  // A separate visual-return timer could start while the two-finger pan was
  // still active. The message then moved against the direct input before the
  // release timer completed.
  //
  // The message must stay at its input position until the adaptive ending
  // signal. One return animation starts after release and never crosses the origin.
  it('keeps a desktop message at its direct position until the pan becomes idle', async () => {
    const message: ChatHistoryItem = {
      id: 'desktop-return-target',
      role: 'user',
      content: 'Prompt return target',
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable-surface]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeRoot || !swipeSurface)
      throw new Error('Expected a desktop message swipe surface.')

    const observedOffsets: number[] = []
    const observer = new MutationObserver(() => {
      const match = swipeSurface.style.transform.match(/translate3d\((-?[\d.]+)px/)
      if (match)
        observedOffsets.push(Number(match[1]))
    })
    observer.observe(swipeSurface, { attributeFilter: ['style'], attributes: true })

    dispatchHorizontalPan(swipeRoot, 80)
    await new Promise(resolve => requestAnimationFrame(resolve))
    const heldOffset = getExpectedLeftSwipeOffset(swipeRoot, 80)
    expect(getTranslateX(swipeSurface)).toBeCloseTo(heldOffset, 3)

    await new Promise(resolve => setTimeout(resolve, 80))
    await nextTick()
    expect(getTranslateX(swipeSurface)).toBeCloseTo(heldOffset, 3)
    expect(screen.emitted('replyMessage')).toBeUndefined()

    await new Promise(resolve => setTimeout(resolve, 60))
    expect(getTranslateX(swipeSurface)).not.toBeCloseTo(heldOffset, 3)

    await new Promise(resolve => setTimeout(resolve, 240))
    observer.disconnect()

    expect(screen.emitted('replyMessage')).toEqual([[
      {
        message,
        label: 'You',
      },
    ]])

    // The message must approach its rest position from the swipe direction.
    // A positive offset means that the return animation crossed the origin.
    expect(Math.max(...observedOffsets)).toBeLessThanOrEqual(0)

    const maximumOffsetIndex = observedOffsets.indexOf(Math.min(...observedOffsets))
    for (let index = maximumOffsetIndex + 1; index < observedOffsets.length; index++)
      expect(observedOffsets[index]).toBeGreaterThanOrEqual(observedOffsets[index - 1])
  })

  // ROOT CAUSE:
  //
  // A fixed deadline after threshold entry commits while the user can still be
  // moving two fingers on the trackpad. The commit also suppresses the remaining
  // direct movement, so the message stops following the gesture before release.
  //
  // Every horizontal wheel event updates the adaptive release estimate. The
  // gesture can commit only after the resulting ending signal.
  it('keeps a desktop reply gesture active while meaningful pan input continues', async () => {
    const message: ChatHistoryItem = {
      id: 'desktop-continuous-pan-target',
      role: 'user',
      content: 'Continuous pan reply target',
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    if (!swipeRoot)
      throw new Error('Expected a desktop message swipe root.')

    dispatchHorizontalPan(swipeRoot, 50)
    await new Promise(resolve => setTimeout(resolve, 20))
    dispatchHorizontalPan(swipeRoot, 3)
    await new Promise(resolve => setTimeout(resolve, 20))
    dispatchHorizontalPan(swipeRoot, 3)
    await new Promise(resolve => setTimeout(resolve, 20))
    dispatchHorizontalPan(swipeRoot, 3)
    await new Promise(resolve => setTimeout(resolve, 80))

    expect(screen.emitted('replyMessage')).toBeUndefined()

    await vi.waitFor(() => {
      expect(screen.emitted('replyMessage')).toEqual([[
        {
          message,
          label: 'You',
        },
      ]])
    })
  })

  // ROOT CAUSE:
  //
  // The swipe primitive reduced all travel after the reply threshold to 25%.
  // A 20-pixel trackpad movement moved the message by only 5 pixels, which made
  // the message look stuck even though the wheel events continued to arrive.
  //
  // Every raw delta updates the nonlinear mapping. The message continues to
  // move after the reply threshold instead of freezing at that point.
  it('keeps the desktop message moving with trackpad travel after the reply threshold', async () => {
    const message: ChatHistoryItem = {
      id: 'desktop-follow-target',
      role: 'user',
      content: 'Follow trackpad travel',
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable-surface]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeRoot || !swipeSurface)
      throw new Error('Expected a desktop message swipe surface.')

    dispatchHorizontalPan(swipeRoot, 50)
    dispatchHorizontalPan(swipeRoot, 20)
    await new Promise(resolve => requestAnimationFrame(resolve))

    expect(getTranslateX(swipeSurface)).toBeCloseTo(getExpectedLeftSwipeOffset(swipeRoot, 70), 3)
  })

  // ROOT CAUSE:
  //
  // A hard maximum offset makes the message stop while wheel events continue.
  // It also hides later reverse movement behind the clamped raw distance.
  //
  // Resistance must increase from the start without making the first pixels
  // feel detached. The visible distance approaches one row width without a
  // reachable hard stop.
  it('increases resistance continuously across the desktop message row', async () => {
    const message: ChatHistoryItem = {
      id: 'desktop-resistance-target',
      role: 'user',
      content: 'Resistance target',
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable-surface]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeRoot || !swipeSurface)
      throw new Error('Expected a desktop message swipe surface.')

    const rowWidth = swipeRoot.clientWidth
    expect(rowWidth).toBeGreaterThan(0)

    const initialDistance = rowWidth * 0.1
    dispatchHorizontalPan(swipeRoot, initialDistance)
    await new Promise(resolve => requestAnimationFrame(resolve))
    const initialOffset = Math.abs(Number.parseFloat(swipeSurface.style.transform.slice(12)))
    const resistanceLength = rowWidth / 4
    const expectedInitialOffset = resistanceLength * (1 - Math.exp(-initialDistance / resistanceLength))

    dispatchHorizontalPan(swipeRoot, rowWidth - initialDistance)
    await new Promise(resolve => requestAnimationFrame(resolve))
    const oneWidthOffset = Math.abs(Number.parseFloat(swipeSurface.style.transform.slice(12)))
    const expectedOneWidthOffset = resistanceLength * (1 - Math.exp(-rowWidth / resistanceLength))

    dispatchHorizontalPan(swipeRoot, rowWidth)
    await new Promise(resolve => requestAnimationFrame(resolve))
    const twoWidthOffset = Math.abs(Number.parseFloat(swipeSurface.style.transform.slice(12)))
    const expectedTwoWidthOffset = resistanceLength * (1 - Math.exp(-(rowWidth * 2) / resistanceLength))

    expect(initialOffset).toBeCloseTo(expectedInitialOffset, 3)
    expect(initialOffset).toBeLessThan(initialDistance)
    expect(oneWidthOffset).toBeCloseTo(expectedOneWidthOffset, 3)
    expect(twoWidthOffset).toBeCloseTo(expectedTwoWidthOffset, 3)
    expect(twoWidthOffset).toBeGreaterThan(oneWidthOffset)
    expect(twoWidthOffset).toBeLessThan(resistanceLength)
  })

  // ROOT CAUSE:
  //
  // Trackpads can send wheel events faster than the display can paint them.
  // Rendering the complete message slot after every event adds work for states
  // that the user cannot see and makes horizontal movement uneven.
  //
  // The primitive must keep every input delta, but it must publish only the
  // latest visible offset for each animation frame.
  it('coalesces trackpad offset updates into the next display frame', async () => {
    const message: ChatHistoryItem = {
      id: 'desktop-frame-target',
      role: 'user',
      content: 'Frame-aligned trackpad movement',
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable-surface]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeRoot || !swipeSurface)
      throw new Error('Expected a desktop message swipe surface.')

    const styleMutations: MutationRecord[] = []
    const observer = new MutationObserver(records => styleMutations.push(...records))
    observer.observe(swipeSurface, { attributeFilter: ['style'], attributes: true })

    for (let index = 0; index < 10; index++) {
      swipeRoot.dispatchEvent(createWheelEvent({
        bubbles: true,
        cancelable: true,
        deltaX: 5,
      }))
      await nextTick()
    }

    expect(styleMutations.length).toBeLessThanOrEqual(2)
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(getTranslateX(swipeSurface)).toBeCloseTo(getExpectedLeftSwipeOffset(swipeRoot, 50), 3)
    observer.disconnect()
  })

  it('selects every mobile message for reply with a left touch swipe', async () => {
    const message: ChatHistoryItem = {
      id: 'mobile-user-reply-target',
      role: 'user',
      content: 'My mobile message',
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        variant: 'mobile',
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable-surface]')).not.toBeNull()
    })

    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    expect(swipeSurface).not.toBeNull()
    if (!swipeSurface)
      throw new Error('Expected a mobile message swipe surface.')

    dispatchTouchEvent(swipeSurface, 'touchstart', 40)
    dispatchTouchEvent(swipeSurface, 'touchmove', 100)
    dispatchTouchEvent(swipeSurface, 'touchend', 100)
    expect(screen.emitted('replyMessage')).toBeUndefined()

    dispatchTouchEvent(swipeSurface, 'touchstart', 100)
    dispatchTouchEvent(swipeSurface, 'touchmove', 40)
    dispatchTouchEvent(swipeSurface, 'touchend', 40)

    await vi.waitFor(() => {
      expect(screen.emitted('replyMessage')).toEqual([[
        {
          message,
          label: 'You',
        },
      ]])
    })
  })

  // ROOT CAUSE:
  //
  // The touch recognizer discarded movement below its intent threshold. It also
  // compared horizontal and vertical travel again on every move. A message first
  // jumped to the threshold, then snapped to rest when a confirmed swipe returned
  // through the small vertical drift accumulated earlier in the gesture.
  //
  // The message now follows directed touch travel before intent is confirmed. Once
  // horizontal intent is confirmed, that decision lasts until the touch ends.
  it('keeps a mobile message attached to the finger before and after the intent threshold', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [{ id: 'continuous-touch-target', role: 'user', content: 'Follow my finger' }],
        variant: 'mobile',
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable-surface]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeRoot || !swipeSurface)
      throw new Error('Expected a mobile message swipe surface.')

    dispatchTouchEvent(swipeSurface, 'touchstart', 100, 60)
    dispatchTouchEvent(swipeSurface, 'touchmove', 96, 61)
    await new Promise(resolve => requestAnimationFrame(resolve))

    expect(getTranslateX(swipeSurface)).toBeCloseTo(getExpectedLeftSwipeOffset(swipeRoot, 4), 3)
    expect(swipeSurface.dataset.swipeActive).toBe('false')

    dispatchTouchEvent(swipeSurface, 'touchmove', 40, 70)
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(swipeSurface.dataset.swipeActive).toBe('true')

    dispatchTouchEvent(swipeSurface, 'touchmove', 92, 70)
    await new Promise(resolve => requestAnimationFrame(resolve))

    expect(getTranslateX(swipeSurface)).toBeCloseTo(getExpectedLeftSwipeOffset(swipeRoot, 8), 3)
    expect(swipeSurface.dataset.swipeActive).toBe('true')

    dispatchTouchEvent(swipeSurface, 'touchcancel', 92, 70)
  })

  // ROOT CAUSE:
  //
  // Pending touch movement updated both the visual offset and threshold state.
  // A diagonal vertical scroll could therefore trigger reply haptics before the
  // recognizer locked the gesture to the vertical axis.
  //
  // Pending movement now updates only the visual offset. Threshold effects start
  // after the recognizer confirms horizontal intent.
  it('does not trigger reply haptics for a diagonal mobile scroll', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [{ id: 'diagonal-scroll-target', role: 'user', content: 'Scroll target' }],
        variant: 'mobile',
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable-surface]')).not.toBeNull()
    })
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeSurface)
      throw new Error('Expected a mobile message swipe surface.')

    dispatchTouchEvent(swipeSurface, 'touchstart', 100, 60)
    dispatchTouchEvent(swipeSurface, 'touchmove', 40, 130)

    expect(triggerHaptic).not.toHaveBeenCalled()
    expect(swipeSurface.dataset.swipeActive).toBe('false')

    dispatchTouchEvent(swipeSurface, 'touchend', 40, 130)
    expect(screen.emitted('replyMessage')).toBeUndefined()
  })

  // https://github.com/moeru-ai/airi/pull/2489
  // ROOT CAUSE:
  //
  // Mobile Safari can dispatch lostpointercapture after a swipe surface captures
  // the active touch pointer. The pointer handler treated this event as a hard
  // cancellation and ignored all later movement from the same physical touch.
  //
  // The mobile gesture now follows the Touch Events stream. Pointer capture loss
  // does not terminate that stream, and touchcancel remains the cancellation signal.
  it('continues a mobile swipe after pointer capture is lost as reported in PR #2489', async () => {
    const message: ChatHistoryItem = {
      id: 'lost-pointer-capture-target',
      role: 'user',
      content: 'Continue this swipe',
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        variant: 'mobile',
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable-surface]')).not.toBeNull()
    })
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeSurface)
      throw new Error('Expected a mobile message swipe surface.')

    dispatchTouchPointer(swipeSurface, 'pointerdown', 100)
    dispatchTouchEvent(swipeSurface, 'touchstart', 100)
    dispatchTouchPointer(swipeSurface, 'pointermove', 84)
    dispatchTouchEvent(swipeSurface, 'touchmove', 84)
    swipeSurface.dispatchEvent(new PointerEvent('lostpointercapture', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
    }))
    dispatchTouchPointer(swipeSurface, 'pointermove', 40)
    dispatchTouchEvent(swipeSurface, 'touchmove', 40)
    swipeSurface.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      buttons: 0,
      clientX: 40,
      clientY: 60,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'touch',
    }))
    dispatchTouchEvent(swipeSurface, 'touchend', 40)

    await vi.waitFor(() => {
      expect(screen.emitted('replyMessage')).toEqual([[
        {
          message,
          label: 'You',
        },
      ]])
    })
  })

  it('returns a message to rest when the touch gesture is cancelled', async () => {
    const message: ChatHistoryItem = { id: 'cancel-target', role: 'user', content: 'Cancel swipe' }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        variant: 'mobile',
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable-surface]')).not.toBeNull()
    })
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeSurface)
      throw new Error('Expected a message swipe surface.')

    dispatchTouchEvent(swipeSurface, 'touchstart', 100)
    dispatchTouchEvent(swipeSurface, 'touchmove', 40)
    await vi.waitFor(() => {
      expect(swipeSurface.dataset.swipeActive).toBe('true')
    })

    dispatchTouchEvent(swipeSurface, 'touchcancel', 40)

    await vi.waitFor(() => {
      expect(swipeSurface.dataset.swipeActive).toBe('false')
    })
    expect(screen.emitted('replyMessage')).toBeUndefined()
    await vi.waitFor(() => {
      expect(swipeSurface.style.transform).toBe('translate3d(0px, 0px, 0px)')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2489#discussion_r3968140745
  // ROOT CAUSE:
  //
  // Chat history permits messages without stable ids, but reply availability only
  // checked their role and visible text. The UI therefore offered reply feedback
  // for a target that the composer could not reference during submission.
  //
  // Reply availability and the event boundary must both require a stable message id.
  it('does not offer reply for a message without a stable id', async () => {
    const message: ChatHistoryItem = {
      role: 'assistant',
      content: 'Inline autonomous artistry result',
      slices: [{ type: 'text', text: 'Inline autonomous artistry result' }],
      tool_results: [],
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    if (!swipeRoot)
      throw new Error('Expected a desktop message swipe root.')

    dispatchHorizontalPan(swipeRoot, 60)
    await new Promise(resolve => setTimeout(resolve, 150))

    expect(screen.emitted('replyMessage')).toBeUndefined()
    expect(screen.container.querySelector('.i-solar\\:reply-bold-duotone')).toBeNull()
  })

  it('does not offer reply for a message without visible text', async () => {
    const message: ChatHistoryItem = {
      id: 'tool-only-message',
      role: 'assistant',
      content: '',
      slices: [{
        type: 'tool-call',
        toolCall: {
          toolCallId: 'tool-1',
          toolCallType: 'function',
          toolName: 'weather',
          args: '{}',
        },
      }],
      tool_results: [],
    }
    const screen = await render(ChatHistory, {
      props: {
        messages: [message],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable-surface]')).not.toBeNull()
    })
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!swipeSurface)
      throw new Error('Expected a message swipe surface.')

    dispatchPointerSwipe(swipeSurface, 100, 40)

    expect(screen.emitted('replyMessage')).toBeUndefined()
    expect(screen.container.querySelector('.i-solar\\:reply-bold-duotone')).toBeNull()
  })

  it('blends mobile press feedback into a swipe', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [{ id: 'press-target', role: 'user', content: 'Press target' }],
        variant: 'mobile',
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-pressing]')).not.toBeNull()
    })
    const trigger = screen.container.querySelector<HTMLElement>('[data-pressing]')
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable-surface]')
    if (!trigger || !swipeRoot || !swipeSurface)
      throw new Error('Expected a chat action menu trigger.')

    dispatchTouchPointer(trigger, 'pointerdown', 100)
    dispatchTouchEvent(trigger, 'touchstart', 100)
    await vi.waitFor(() => {
      expect(trigger.dataset.pressing).toBe('true')
    })

    dispatchTouchPointer(window, 'pointermove', 96)
    dispatchTouchEvent(trigger, 'touchmove', 96)
    await new Promise(resolve => requestAnimationFrame(resolve))

    expect(trigger.dataset.pressing).toBe('true')
    expect(getTranslateX(swipeSurface)).toBeCloseTo(getExpectedLeftSwipeOffset(swipeRoot, 4), 3)

    // Press feedback releases after this movement while the same touch stream
    // continues to drive the surrounding swipe surface.
    dispatchTouchPointer(window, 'pointermove', 80)
    dispatchTouchEvent(trigger, 'touchmove', 80)
    await vi.waitFor(() => {
      expect(trigger.dataset.pressing).toBe('false')
      expect(swipeSurface.dataset.swipeActive).toBe('true')
    })

    dispatchTouchEvent(trigger, 'touchcancel', 80)
  })

  it('does not apply mobile press feedback to a desktop message', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [{ id: 'desktop-press-target', role: 'user', content: 'Desktop target' }],
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-pressing]')).not.toBeNull()
    })
    const trigger = screen.container.querySelector<HTMLElement>('[data-pressing]')
    if (!trigger)
      throw new Error('Expected a chat action menu trigger.')

    dispatchTouchPointer(trigger, 'pointerdown', 100)

    expect(trigger.dataset.pressing).toBe('false')
  })

  it('emits tool-call-rerun with message context when a tool call rerun button is clicked', async () => {
    const args = JSON.stringify({ location: 'Tokyo' })
    const assistantMessage: ChatHistoryItem = {
      role: 'assistant',
      content: '',
      slices: [
        {
          type: 'tool-call',
          toolCall: {
            toolCallId: 'call-weather',
            toolCallType: 'function',
            toolName: 'weather',
            args,
          },
        },
      ],
      tool_results: [],
      createdAt: 1710000000000,
    }
    const messages: ChatHistoryItem[] = [
      { role: 'user', content: 'weather in Tokyo' },
      assistantMessage,
    ]

    const screen = await render(ChatHistory, {
      props: {
        messages,
        style: 'height: 480px; width: 480px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await screen.getByLabelText('Re-run tool call').click()

    expect(screen.emitted('toolCallRerun')).toEqual([[
      {
        message: assistantMessage,
        index: 1,
        key: getChatHistoryItemKey(assistantMessage, 1),
        toolCallId: 'call-weather',
        toolName: 'weather',
        args,
      },
    ]])
  })
})
