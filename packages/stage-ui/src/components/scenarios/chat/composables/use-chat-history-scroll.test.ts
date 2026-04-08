// @vitest-environment jsdom

import type { ChatHistoryItem } from '../../../../types/chat'

import assert from 'node:assert/strict'

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

    const scrollIntoView = vi.fn()
    const mountScrollTo = vi.fn((options?: ScrollToOptions) => {
      container.scrollTop = options?.top ?? 0
    })
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    setContainerScrollTo(container, mountScrollTo)
    const frameController = createRequestAnimationFrameController()

    const scope = effectScope()

    scope.run(() => {
      useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
      })
    })

    await flushDom()
    frameController.runAllFrames()
    await flushDom()

    expect(mountScrollTo).toHaveBeenCalledTimes(1)
    expect(mountScrollTo).toHaveBeenCalledWith({ top: 480 })

    const nextMessage = createAssistantMessage('assistant-2', 'new tail', 3)
    messageList.value = [...messageList.value, nextMessage]
    renderMessages(container, messageList.value)

    await flushDom()

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })

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

    const scope = effectScope()

    scope.run(() => {
      useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
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
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1696 })
    expect(container.scrollTop).toBe(1696)

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

    const scope = effectScope()
    const state = scope.run(() => {
      return useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
      })
    })

    await flushDom()
    scrollIntoView.mockClear()

    const firstNode = container.querySelector('[data-chat-message-key="user-1"]')
    assert.ok(firstNode)
    firstNode.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    await flushDom()

    expect(state?.isInspectingHistory.value).toBe(true)

    messageList.value = [...messageList.value, createAssistantMessage('assistant-2', 'later', 3)]
    renderMessages(container, messageList.value)

    await flushDom()

    expect(scrollIntoView).not.toHaveBeenCalled()

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

    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      if (this.dataset.chatMessageKey === 'user-1')
        container.scrollTop = 180
      else if (this.dataset.chatMessageKey === 'assistant-2')
        container.scrollTop = 260
    })
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    setContainerScrollTo(container, vi.fn())

    const scope = effectScope()

    scope.run(() => {
      useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
      })
    })

    await flushDom()
    scrollIntoView.mockClear()

    messageList.value = [...messageList.value, createUserMessage('user-1', 'question', 2)]
    defineScrollMetrics(container, {
      clientHeight: 240,
      scrollHeight: 600,
      scrollTop: 240,
    })
    renderMessages(container, messageList.value)
    await flushDom()

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenNthCalledWith(1, { block: 'start' })
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

    expect(scrollIntoView).toHaveBeenCalledTimes(2)
    expect(scrollIntoView).toHaveBeenNthCalledWith(2, { block: 'start' })

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

    const scope = effectScope()

    scope.run(() => {
      useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
      })
    })

    await flushDom()
    scrollIntoView.mockClear()

    defineScrollMetrics(container, {
      clientHeight: 180,
      scrollHeight: 560,
      scrollTop: 240,
    })

    messageList.value = [...messageList.value, createAssistantMessage('assistant-2', 'follow-up', 2)]
    renderMessages(container, messageList.value)
    await flushDom()

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })

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

    const scope = effectScope()

    scope.run(() => {
      useChatHistoryScroll({
        containerRef: ref(container),
        messages: messageList,
        getKey: message => message.id!,
      })
    })

    await flushDom()
    scrollTo.mockClear()

    defineScrollMetrics(container, {
      clientHeight: 240,
      scrollHeight: 760,
      scrollTop: 240,
    })

    messageList.value = [createAssistantMessage('assistant-1', 'hello there', 1)]
    renderMessages(container, messageList.value)

    await flushDom()

    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ top: 760 })
    expect(scrollIntoView).not.toHaveBeenCalled()

    scope.stop()
  })
})
