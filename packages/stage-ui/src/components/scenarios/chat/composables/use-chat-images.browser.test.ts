import type { ChatImageAttachment } from './use-chat-images'

import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'

import { useChatComposer } from './use-chat-composer'
import { useChatImages } from './use-chat-images'

describe('chat image drafts', () => {
  it('reads actual files and restores attachments after failure', async () => {
    const send = vi.fn().mockRejectedValue(new Error('Provider unavailable'))
    const activeSessionId = shallowRef('first')
    let composer!: ReturnType<typeof useChatComposer<ChatImageAttachment>>
    let images!: ReturnType<typeof useChatImages>
    const screen = render(defineComponent({
      setup() {
        composer = useChatComposer<ChatImageAttachment>({ activeSessionId, send })
        images = useChatImages(composer, () => activeSessionId.value)
        return () => h('div')
      },
    }), { global: { plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] } })
    const file = new File(['image bytes'], 'image.png', { type: 'image/png' })
    await images.addFiles([file])
    expect(composer.attachments.value[0].data).toBe(btoa('image bytes'))
    expect(composer.attachments.value[0].mimeType).toBe('image/png')
    expect(images.pending.value).toBe(0)
    expect(await composer.submit()).toBe('restored')
    expect(composer.attachments.value).toHaveLength(1)
    activeSessionId.value = 'second'
    expect(composer.attachments.value).toHaveLength(0)
    screen.unmount()
  })

  it('discards a pending read when the user switches sessions and back', async () => {
    const activeSessionId = shallowRef('first')
    let composer!: ReturnType<typeof useChatComposer<ChatImageAttachment>>
    let images!: ReturnType<typeof useChatImages>
    const screen = render(defineComponent({
      setup() {
        composer = useChatComposer<ChatImageAttachment>({ activeSessionId, send: vi.fn() })
        images = useChatImages(composer, () => activeSessionId.value)
        return () => h('div')
      },
    }), { global: { plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] } })
    const reading = images.addFiles([new File(['image'], 'image.png', { type: 'image/png' })])
    activeSessionId.value = 'second'
    expect(images.pending.value).toBe(0)
    activeSessionId.value = 'first'
    await reading
    expect(composer.attachments.value).toHaveLength(0)
    await images.addFiles([new File(['text'], 'text.txt', { type: 'text/plain' })])
    expect(images.error.value).toBe('stage.chat.images.unsupported')
    expect(composer.attachments.value).toHaveLength(0)
    screen.unmount()
  })

  it('rejects attachment batches before reading when count or total size exceeds the limits', async () => {
    const activeSessionId = shallowRef('first')
    let composer!: ReturnType<typeof useChatComposer<ChatImageAttachment>>
    let images!: ReturnType<typeof useChatImages>
    const screen = render(defineComponent({
      setup() {
        composer = useChatComposer<ChatImageAttachment>({ activeSessionId, send: vi.fn() })
        images = useChatImages(composer, () => activeSessionId.value)
        return () => h('div')
      },
    }), { global: { plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] } })

    const files = Array.from({ length: 5 }, (_, index) => new File(['image'], `${index}.png`, { type: 'image/png' }))
    await images.addFiles(files)
    expect(images.error.value).toBe('stage.chat.images.too-many')
    expect(images.pending.value).toBe(0)

    const largeFiles = [0, 1].map((index) => {
      const file = new File(['image'], `${index}.png`, { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 })
      return file
    })
    await images.addFiles(largeFiles)
    expect(images.error.value).toBe('stage.chat.images.total-too-large')
    expect(images.pending.value).toBe(0)
    expect(composer.attachments.value).toHaveLength(0)
    screen.unmount()
  })

  it('reserves limits while another image batch is still loading', async () => {
    const activeSessionId = shallowRef('first')
    let composer!: ReturnType<typeof useChatComposer<ChatImageAttachment>>
    let images!: ReturnType<typeof useChatImages>
    const screen = render(defineComponent({
      setup() {
        composer = useChatComposer<ChatImageAttachment>({ activeSessionId, send: vi.fn() })
        images = useChatImages(composer, () => activeSessionId.value)
        return () => h('div')
      },
    }), { global: { plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] } })

    // ROOT CAUSE:
    //
    // Concurrent file-picker and paste batches used only committed attachments
    // for validation. Both batches could pass before either FileReader completed.
    const firstBatch = images.addFiles(Array.from({ length: 3 }, (_, index) => new File(['image'], `${index}.png`, { type: 'image/png' })))
    await images.addFiles(Array.from({ length: 2 }, (_, index) => new File(['image'], `extra-${index}.png`, { type: 'image/png' })))
    await firstBatch

    expect(images.error.value).toBe('stage.chat.images.too-many')
    expect(composer.attachments.value).toHaveLength(3)
    expect(images.pending.value).toBe(0)
    screen.unmount()
  })
})
