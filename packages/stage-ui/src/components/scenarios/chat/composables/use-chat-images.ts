import type { ChatSendPayload } from '../../../../stores/chat'
import type { ChatComposerController } from './use-chat-composer'

import { errorMessageFrom } from '@moeru/std'
import { onScopeDispose, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const MAX_IMAGE_COUNT = 4
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** A local image draft. Only the serialized image fields cross the chat boundary. */
export type ChatImageAttachment = NonNullable<ChatSendPayload['attachments']>[number] & {
  file: File
  previewId: string
}

/**
 * Reads selected and pasted images in order for one composer. Pending reads are
 * discarded after a session change or unmount, so images cannot enter another chat.
 */
export function useChatImages(composer: ChatComposerController<ChatImageAttachment>, getSessionId: () => string) {
  const { t } = useI18n()
  const error = shallowRef('')
  const pending = shallowRef(0)
  let disposed = false
  let generation = 0
  let reservedImageCount = 0
  let reservedImageBytes = 0
  watch(getSessionId, () => {
    generation++
    pending.value = 0
    reservedImageCount = 0
    reservedImageBytes = 0
    composer.attachments.value = []
    error.value = ''
  }, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
  })

  async function addFiles(files: File[]) {
    const sessionId = getSessionId()
    const readGeneration = generation
    error.value = ''
    for (const file of files) {
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
        error.value = t('stage.chat.images.unsupported')
        return
      }
      if (file.size > MAX_IMAGE_BYTES) {
        error.value = t('stage.chat.images.too-large')
        return
      }
    }

    const batchBytes = files.reduce((total, file) => total + file.size, 0)
    const nextImageCount = composer.attachments.value.length + reservedImageCount + files.length
    const aggregateBytes = composer.attachments.value.reduce((total, attachment) => total + attachment.file.size, 0)
      + reservedImageBytes
      + batchBytes
    if (nextImageCount > MAX_IMAGE_COUNT) {
      error.value = t('stage.chat.images.too-many', { count: MAX_IMAGE_COUNT })
      return
    }
    if (aggregateBytes > MAX_IMAGE_BYTES) {
      error.value = t('stage.chat.images.total-too-large')
      return
    }
    reservedImageCount += files.length
    reservedImageBytes += batchBytes
    pending.value++
    try {
      const images: ChatImageAttachment[] = []
      for (const file of files) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error(t('stage.chat.images.read-failed')))
          reader.onerror = () => reject(new Error(t('stage.chat.images.read-failed')))
          reader.readAsDataURL(file)
        })
        images.push({ type: 'image', data: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: file.type, file, previewId: crypto.randomUUID() })
      }
      if (!disposed && readGeneration === generation && sessionId === getSessionId())
        composer.addAttachments(...images)
    }
    catch (cause) {
      if (!disposed && readGeneration === generation && sessionId === getSessionId())
        error.value = errorMessageFrom(cause) ?? t('stage.chat.images.read-failed')
    }
    finally {
      if (readGeneration === generation) {
        reservedImageCount -= files.length
        reservedImageBytes -= batchBytes
        pending.value--
      }
    }
  }

  function selectFiles(event: Event) {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || !input.files)
      return
    void addFiles(Array.from(input.files))
    input.value = ''
  }

  return { addFiles, selectFiles, error, pending }
}
