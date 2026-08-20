// @vitest-environment jsdom

import type { ChatHistoryItem } from '../../../../types/chat'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { useChatHistoryScroll } from './use-chat-history-scroll'

function createAssistantMessage(id: string, content: string, createdAt: number): ChatHistoryItem {
  return {
    id,
    role: 'assistant',
    content,
    createdAt,
    slices: [{ type: 'text', text: content }],
    tool_results: [],
  }
}

function createUserMessage(id: string, content: string, createdAt: number): ChatHistoryItem {
  return {
    id,
    role: 'user',
    content,
    createdAt,
  }
}

function setContainerScrollTo(container: HTMLElement, handler: (options?: ScrollToOptions) => void) {
  Object.defineProperty(container, 'scrollTo', {
    configurable: true,
    value: handler as HTMLElement['scrollTo'],
  })
}

function defineScrollMetrics(element: HTMLElement, metrics: {
  clientHeight?: number
  scrollHeight?: number
  scrollTop?: number
}) {
  let scrollTop = metrics.scrollTop ?? 0

  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => metrics.clientHeight ?? 240,
  })

  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => metrics.scrollHeight ?? 480,
  })

  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value
    },
  })
}

async function flushDom() {
  await nextTick()
  await Promise.resolve()
}

function createRequestAnimationFrameController() {
  const callbacks: FrameRequestCallback[] = []

  const stub = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    })

  function runNextFrame() {
    const callback = callbacks.shift()
    callback?.(performance.now())
  }

  function runAllFrames() {
    while (callbacks.length > 0)
      runNextFrame()
  }

  return {
    stub,
    runNextFrame,
    runAllFrames,
  }
}

function renderMessages(container: HTMLElement, messages: ChatHistoryItem[]) {
  container.replaceChildren()

  for (const [index, message] of messages.entries()) {
    const node = document.createElement('div')
    node.dataset.chatMessageKey = String(message.id ?? `${message.role}:${index}`)
    node.dataset.chatMessageIndex = String(index)
    node.dataset.chatMessageRole = message.role
    node.tabIndex = 0
    container.appendChild(node)
  }
}

afterEach(() => {
  document.body.replaceChildren()
  document.getSelection()?.removeAllRanges()
  vi.restoreAllMocks()
})

describe('useChatHistoryScroll', () => {
  // ROOT CAUSE:
  //
  // Replacing the mask or changing message opacity at the viewport boundary
  // made a short edge flash when a message entered the fade region.
  //
  // We keep one mask declaration mounted and update only its stops in an animation frame.
  it('keeps the message mask mounted while updating its stops during scroll', async () => {
    const container = document.createElement('div')
    const surface = document.createElement('div')
    const stableMask = 'linear-gradient(to bottom, transparent var(--chat-top-fade-transparent-stop), black var(--chat-top-fade-opaque-stop))'
    surface.dataset.chatMessageSurface = ''
    surface.style.maskImage = stableMask
    container.appendChild(surface)
    document.body.appendChild(container)

    defineScrollMetrics(container, {
      clientHeight: 100,
      scrollHeight: 300,
      scrollTop: 200,
    })

    let surfaceTop = -84
    vi.spyOn(container, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: 100,
      height: 100,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }))
    vi.spyOn(surface, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: surfaceTop + 80,
      height: 80,
      left: 0,
      right: 200,
      top: surfaceTop,
      width: 200,
      x: 0,
      y: surfaceTop,
      toJSON: () => ({}),
    }))

    setContainerScrollTo(container, vi.fn())
    HTMLElement.prototype.scrollIntoView = vi.fn()
    const frameController = createRequestAnimationFrameController()
    const scope = effectScope()

    scope.run(() => {
      useChatHistoryScroll({
        containerRef: ref(container),
        messages: ref([{ id: 'message-1', role: 'user' }]),
        getKey: message => message.id,
        scrollToIndex: vi.fn(),
        topFadeRatio: ref(0.2),
      })
    })

    await flushDom()
    frameController.runAllFrames()

    expect(surface.style.maskImage).toBe(stableMask)
    expect(surface.style.opacity).toBe('')
    expect(surface.style.getPropertyValue('--chat-top-fade-transparent-stop')).toBe('84px')
    expect(surface.style.getPropertyValue('--chat-top-fade-opaque-stop')).toBe('104px')

    surfaceTop = -76
    container.dispatchEvent(new Event('scroll'))

    expect(surface.style.maskImage).toBe(stableMask)
    expect(surface.style.opacity).toBe('')
    expect(surface.style.getPropertyValue('--chat-top-fade-transparent-stop')).toBe('84px')
    expect(surface.style.getPropertyValue('--chat-top-fade-opaque-stop')).toBe('104px')

    frameController.runNextFrame()

    expect(surface.style.maskImage).toBe(stableMask)
    expect(surface.style.opacity).toBe('')
    expect(surface.style.getPropertyValue('--chat-top-fade-transparent-stop')).toBe('76px')
    expect(surface.style.getPropertyValue('--chat-top-fade-opaque-stop')).toBe('96px')

    scope.stop()
  })

  it('scrolls on mount and scrolls a new tail into view while following the live edge', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    defineScrollMetrics(container, {
      clientHeight: 240,
      scrollHeight: 480,
      scrollTop: 240,
    })

    const initialMessages = [
      createUserMessage('user-1', 'hello', 1),
      createAssistantMessage('assistant-1', 'hi', 2),
    ]

    const messageList = ref<ChatHistoryItem[]>(initialMessages)
    renderMessages(container, messageList.value)

    const mountScrollTo = vi.fn((options?: ScrollToOptions) => {
      container.scrollTop = options?.top ?? 0
    })
    setContainerScrollTo(container, mountScrollTo)
    const scrollToIndex = vi.fn((_index: number, align: 'start' | 'end') => {
      if (align === 'end')
        container.scrollTop = container.scrollHeight
    })
    const frameController = createRequestAnimationFrameController()

    const scope = effectScope()

    scope.run(() => {
      useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
        scrollToIndex,
      })
    })

    await flushDom()
    frameController.runAllFrames()
    await flushDom()

    expect(scrollToIndex).toHaveBeenCalledWith(1, 'end')

    const nextMessage = createAssistantMessage('assistant-2', 'new tail', 3)
    messageList.value = [...messageList.value, nextMessage]
    renderMessages(container, messageList.value)

    await flushDom()

    expect(scrollToIndex).toHaveBeenLastCalledWith(2, 'start')

    scope.stop()
  })

  it('scrolls to the bottom on mount after delayed layout settles', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let scrollHeight = 480
    defineScrollMetrics(container, {
      clientHeight: 240,
      scrollHeight,
      scrollTop: 0,
    })

    const messageList = ref<ChatHistoryItem[]>([
      createUserMessage('user-1', 'hello', 1),
      createAssistantMessage('assistant-1', 'hi', 2),
    ])
    renderMessages(container, messageList.value)

    const scrollTo = vi.fn((options?: ScrollToOptions) => {
      container.scrollTop = options?.top ?? 0
    })
    setContainerScrollTo(container, scrollTo)
    HTMLElement.prototype.scrollIntoView = vi.fn()

    const frameController = createRequestAnimationFrameController()
    const scrollToIndex = vi.fn((_index: number, align: 'start' | 'end') => {
      if (align === 'end')
        container.scrollTop = container.scrollHeight
    })

    const scope = effectScope()

    scope.run(() => {
      useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
        scrollToIndex,
      })
    })

    await flushDom()

    scrollHeight = 1696
    defineScrollMetrics(container, {
      clientHeight: 565,
      scrollHeight,
      scrollTop: container.scrollTop,
    })

    frameController.runAllFrames()
    await flushDom()

    expect(frameController.stub).toHaveBeenCalled()
    expect(scrollToIndex).toHaveBeenLastCalledWith(1, 'end')
    expect(container.scrollTop).toBe(1696)

    scope.stop()
  })

  // ROOT CAUSE:
  //
  // Persisted history can hydrate after the scroll container mounts. Marking the
  // initial scroll as complete while the list is empty leaves the restored history
  // at its first message instead of the live edge.
  //
  // We defer the one-time initial scroll until both the container and messages exist.
  it('scrolls restored history after messages hydrate into an empty mounted list', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    defineScrollMetrics(container, {
      clientHeight: 240,
      scrollHeight: 760,
      scrollTop: 0,
    })

    const messageList = ref<ChatHistoryItem[]>([])
    const scrollToIndex = vi.fn()
    const frameController = createRequestAnimationFrameController()
    const scope = effectScope()

    scope.run(() => {
      useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
        scrollToIndex,
      })
    })

    await flushDom()
    frameController.runAllFrames()
    expect(scrollToIndex).not.toHaveBeenCalled()

    messageList.value = [
      createUserMessage('user-1', 'restored question', 1),
      createAssistantMessage('assistant-1', 'restored answer', 2),
    ]
    renderMessages(container, messageList.value)

    await flushDom()
    frameController.runAllFrames()
    await flushDom()

    expect(scrollToIndex).toHaveBeenCalledWith(1, 'end')

    scope.stop()
  })

  it('blocks auto-scroll while the user is inspecting a non-tail message', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    defineScrollMetrics(container, {
      clientHeight: 240,
      scrollHeight: 480,
      scrollTop: 240,
    })

    const first = createUserMessage('user-1', 'hello', 1)
    const second = createAssistantMessage('assistant-1', 'hi', 2)
    const messageList = ref<ChatHistoryItem[]>([first, second])
    renderMessages(container, messageList.value)

    const scrollIntoView = vi.fn()
    setContainerScrollTo(container, vi.fn())
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    const scrollToIndex = vi.fn()

    const scope = effectScope()
    const state = scope.run(() => {
      return useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
        scrollToIndex,
      })
    })

    await flushDom()
    scrollToIndex.mockClear()

    const firstNode = container.querySelector('[data-chat-message-key="user-1"]')
    expect(firstNode).not.toBeNull()
    if (!firstNode)
      throw new Error('Expected first chat node to exist.')
    firstNode.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    await flushDom()

    expect(state?.isInspectingHistory.value).toBe(true)

    messageList.value = [...messageList.value, createAssistantMessage('assistant-2', 'later', 3)]
    renderMessages(container, messageList.value)

    await flushDom()

    expect(scrollToIndex).not.toHaveBeenCalled()

    scope.stop()
  })

  it('keeps following the conversation after auto-scrolling a user message to the top', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    defineScrollMetrics(container, {
      clientHeight: 240,
      scrollHeight: 480,
      scrollTop: 240,
    })

    const messageList = ref<ChatHistoryItem[]>([
      createAssistantMessage('assistant-1', 'hello', 1),
    ])
    renderMessages(container, messageList.value)

    const scrollToIndex = vi.fn((index: number) => {
      if (index === 1)
        container.scrollTop = 180
      else if (index === 2)
        container.scrollTop = 260
    })
    setContainerScrollTo(container, vi.fn())

    const scope = effectScope()

    scope.run(() => {
      useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
        scrollToIndex,
      })
    })

    await flushDom()
    scrollToIndex.mockClear()

    messageList.value = [...messageList.value, createUserMessage('user-1', 'question', 2)]
    defineScrollMetrics(container, {
      clientHeight: 240,
      scrollHeight: 600,
      scrollTop: 240,
    })
    renderMessages(container, messageList.value)
    await flushDom()

    expect(scrollToIndex).toHaveBeenCalledTimes(1)
    expect(scrollToIndex).toHaveBeenNthCalledWith(1, 1, 'start')
    container.dispatchEvent(new Event('scroll'))
    await flushDom()

    messageList.value = [...messageList.value, createAssistantMessage('assistant-2', 'answer', 3)]
    defineScrollMetrics(container, {
      clientHeight: 240,
      scrollHeight: 760,
      scrollTop: 180,
    })
    renderMessages(container, messageList.value)
    await flushDom()

    expect(scrollToIndex).toHaveBeenCalledTimes(2)
    expect(scrollToIndex).toHaveBeenNthCalledWith(2, 2, 'start')

    scope.stop()
  })

  it('treats layout-only tail drift as still following until the user manually disengages', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    defineScrollMetrics(container, {
      clientHeight: 240,
      scrollHeight: 480,
      scrollTop: 240,
    })

    const messageList = ref<ChatHistoryItem[]>([
      createAssistantMessage('assistant-1', 'hello', 1),
    ])
    renderMessages(container, messageList.value)

    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    setContainerScrollTo(container, vi.fn())
    const scrollToIndex = vi.fn()

    const scope = effectScope()

    scope.run(() => {
      useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
        scrollToIndex,
      })
    })

    await flushDom()
    scrollToIndex.mockClear()

    defineScrollMetrics(container, {
      clientHeight: 180,
      scrollHeight: 560,
      scrollTop: 240,
    })

    messageList.value = [...messageList.value, createAssistantMessage('assistant-2', 'follow-up', 2)]
    renderMessages(container, messageList.value)
    await flushDom()

    expect(scrollToIndex).toHaveBeenCalledTimes(1)
    expect(scrollToIndex).toHaveBeenCalledWith(1, 'start')

    scope.stop()
  })

  it('keeps following a streaming tail without top-aligning it again while the user is still following the conversation', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    defineScrollMetrics(container, {
      clientHeight: 240,
      scrollHeight: 480,
      scrollTop: 240,
    })

    const streamedMessage = createAssistantMessage('assistant-1', 'hello', 1)
    const messageList = ref<ChatHistoryItem[]>([streamedMessage])
    renderMessages(container, messageList.value)

    const scrollTo = vi.fn((options?: ScrollToOptions) => {
      container.scrollTop = options?.top ?? 0
    })
    setContainerScrollTo(container, scrollTo)
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    const scrollToIndex = vi.fn((_index: number, align: 'start' | 'end') => {
      if (align === 'end')
        container.scrollTop = container.scrollHeight
    })

    const scope = effectScope()

    scope.run(() => {
      useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
        scrollToIndex,
      })
    })

    await flushDom()
    scrollToIndex.mockClear()

    defineScrollMetrics(container, {
      clientHeight: 240,
      scrollHeight: 760,
      scrollTop: 240,
    })

    messageList.value = [createAssistantMessage('assistant-1', 'hello there', 1)]
    renderMessages(container, messageList.value)

    await flushDom()

    expect(scrollToIndex).toHaveBeenCalledTimes(1)
    expect(scrollToIndex).toHaveBeenCalledWith(0, 'end')
    expect(scrollIntoView).not.toHaveBeenCalled()

    scope.stop()
  })
})
