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
    activeSessionId.value = 'first'
    await reading
    expect(composer.attachments.value).toHaveLength(0)
    await images.addFiles([new File(['text'], 'text.txt', { type: 'text/plain' })])
    expect(images.error.value).toBe('stage.chat.images.unsupported')
    expect(composer.attachments.value).toHaveLength(0)
    screen.unmount()
  })
})
