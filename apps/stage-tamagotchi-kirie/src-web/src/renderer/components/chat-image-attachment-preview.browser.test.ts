import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'

import ChatImageAttachmentPreview from './chat-image-attachment-preview.vue'

describe('chat image attachment preview', () => {
  // ROOT CAUSE:
  //
  // The parent created Object URLs but only released them after removal or send.
  // Unmounting with a pending attachment left its URL alive.
  //
  // The preview now owns the URL through useObjectUrl. Component disposal
  // revokes the URL.
  it('releases its Object URL when the preview unmounts', async () => {
    const file = new File(['preview-bytes'], 'preview.png', { type: 'image/png' })
    const screen = await render(ChatImageAttachmentPreview, {
      props: { file },
    })
    const image = screen.container.querySelector<HTMLImageElement>('img')

    expect(image).not.toBeNull()
    if (!image)
      throw new Error('Expected an image attachment preview.')

    const previewUrl = image.src
    await expect(fetch(previewUrl).then(response => response.text())).resolves.toBe('preview-bytes')

    screen.unmount()

    await expect(fetch(previewUrl)).rejects.toThrow()
  })
})
