import type { EffectScope, ShallowRef } from 'vue'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'

import { useChatHistoryScroll } from './use-chat-history-scroll'

interface TestMessage {
  id: string
}

const activeScopes: EffectScope[] = []

function createScrollContainer(messageCount: number) {
  const container = document.createElement('div')
  container.style.height = '120px'
  container.style.overflowY = 'auto'
  container.style.width = '320px'
  replaceMessageItems(container, messageCount)
  document.body.appendChild(container)
  return container
}

function replaceMessageItems(container: HTMLElement, messageCount: number) {
  const items = Array.from({ length: messageCount }, (_, index) => {
    const item = document.createElement('div')
    item.className = 'chat-message-item'
    item.style.height = '120px'
    item.tabIndex = 0
    item.textContent = `Message ${index}`
    return item
  })
  container.replaceChildren(...items)
}

function startScrollBehavior({
  container,
  messages,
  scrollToIndex,
}: {
  container: ShallowRef<HTMLElement | null>
  messages: ShallowRef<TestMessage[]>
  scrollToIndex: (index: number, align: 'start' | 'end') => void
}) {
  const scope = effectScope()
  activeScopes.push(scope)
  scope.run(() => {
    useChatHistoryScroll({
      container,
      messages,
      getKey: message => message.id,
      scrollToIndex,
    })
  })
}

async function flushReactivity() {
  await nextTick()
  await Promise.resolve()
}

afterEach(() => {
  for (const scope of activeScopes)
    scope.stop()
  activeScopes.length = 0
  document.body.replaceChildren()
  document.getSelection()?.removeAllRanges()
})

describe('useChatHistoryScroll', () => {
  // ROOT CAUSE:
  //
  // Persisted history can hydrate after the scroll container mounts. Marking the
  // initial scroll as complete while the list is empty leaves the restored history
  // at its first message instead of the live edge.
  //
  // The initial request now waits until both the container and one message exist.
  it('requests the restored history tail after delayed hydration', async () => {
    const container = shallowRef<HTMLElement | null>(null)
    const messages = shallowRef<TestMessage[]>([])
    const scrollToIndex = vi.fn()
    startScrollBehavior({ container, messages, scrollToIndex })

    await flushReactivity()
    expect(scrollToIndex).not.toHaveBeenCalled()

    container.value = createScrollContainer(2)
    messages.value = [{ id: 'user-1' }, { id: 'assistant-1' }]
    await flushReactivity()

    expect(scrollToIndex).toHaveBeenCalledWith(1, 'end')
  })

  it('aligns a new tail message to the viewport start', async () => {
    const currentContainer = createScrollContainer(2)
    currentContainer.scrollTop = currentContainer.scrollHeight
    const container = shallowRef<HTMLElement | null>(currentContainer)
    const messages = shallowRef<TestMessage[]>([{ id: 'user-1' }, { id: 'assistant-1' }])
    const scrollToIndex = vi.fn()
    startScrollBehavior({ container, messages, scrollToIndex })
    await flushReactivity()
    scrollToIndex.mockClear()

    replaceMessageItems(currentContainer, 3)
    messages.value = [...messages.value, { id: 'assistant-2' }]
    await flushReactivity()

    expect(scrollToIndex).toHaveBeenCalledTimes(1)
    expect(scrollToIndex).toHaveBeenCalledWith(2, 'start')
  })

  it('blocks a new-message scroll while the reader points at an older message', async () => {
    const currentContainer = createScrollContainer(2)
    currentContainer.scrollTop = currentContainer.scrollHeight
    const container = shallowRef<HTMLElement | null>(currentContainer)
    const messages = shallowRef<TestMessage[]>([{ id: 'user-1' }, { id: 'assistant-1' }])
    const scrollToIndex = vi.fn()
    startScrollBehavior({ container, messages, scrollToIndex })
    await flushReactivity()
    scrollToIndex.mockClear()

    currentContainer.firstElementChild?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    replaceMessageItems(currentContainer, 3)
    messages.value = [...messages.value, { id: 'assistant-2' }]
    await flushReactivity()

    expect(scrollToIndex).not.toHaveBeenCalled()
  })

  it('keeps following after a layout-only scroll moves the viewport from the tail', async () => {
    const currentContainer = createScrollContainer(2)
    currentContainer.scrollTop = currentContainer.scrollHeight
    const container = shallowRef<HTMLElement | null>(currentContainer)
    const messages = shallowRef<TestMessage[]>([{ id: 'user-1' }, { id: 'assistant-1' }])
    const scrollToIndex = vi.fn()
    startScrollBehavior({ container, messages, scrollToIndex })
    await flushReactivity()
    scrollToIndex.mockClear()

    currentContainer.scrollTop = 0
    currentContainer.dispatchEvent(new Event('scroll'))
    replaceMessageItems(currentContainer, 3)
    messages.value = [...messages.value, { id: 'assistant-2' }]
    await flushReactivity()

    expect(scrollToIndex).toHaveBeenCalledWith(2, 'start')
  })

  it('stops following after a user scroll moves the viewport from the tail', async () => {
    const currentContainer = createScrollContainer(2)
    currentContainer.scrollTop = currentContainer.scrollHeight
    const container = shallowRef<HTMLElement | null>(currentContainer)
    const messages = shallowRef<TestMessage[]>([{ id: 'user-1' }, { id: 'assistant-1' }])
    const scrollToIndex = vi.fn()
    startScrollBehavior({ container, messages, scrollToIndex })
    await flushReactivity()
    scrollToIndex.mockClear()

    currentContainer.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100 }))
    currentContainer.scrollTop = 0
    currentContainer.dispatchEvent(new Event('scroll'))
    replaceMessageItems(currentContainer, 3)
    messages.value = [...messages.value, { id: 'assistant-2' }]
    await flushReactivity()

    expect(scrollToIndex).not.toHaveBeenCalled()
  })

  it('keeps a streaming tail aligned to the viewport end', async () => {
    const currentContainer = createScrollContainer(1)
    const container = shallowRef<HTMLElement | null>(currentContainer)
    const messages = shallowRef<TestMessage[]>([{ id: 'assistant-1' }])
    const scrollToIndex = vi.fn()
    startScrollBehavior({ container, messages, scrollToIndex })
    await flushReactivity()
    scrollToIndex.mockClear()

    messages.value = [{ id: 'assistant-1' }]
    await flushReactivity()

    expect(scrollToIndex).toHaveBeenCalledTimes(1)
    expect(scrollToIndex).toHaveBeenCalledWith(0, 'end')
  })
})
