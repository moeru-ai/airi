import type { ChatSendPayload } from '../../../../stores/chat'
import type { ChatComposerController } from './use-chat-composer'

import { errorMessageFrom } from '@moeru/std'
import { onScopeDispose, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

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
  watch(getSessionId, () => {
    generation++
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
    pending.value++
    try {
      const images: ChatImageAttachment[] = []
      for (const file of files) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))
          throw new Error(t('stage.chat.images.unsupported'))
        if (file.size > 20 * 1024 * 1024)
          throw new Error(t('stage.chat.images.too-large'))

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
      pending.value--
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
