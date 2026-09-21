import type { ChatSendPayload } from '../../../../stores/chat'
import type { ChatComposerController } from './use-chat-composer'

import { errorMessageFrom } from '@moeru/std'
import { onScopeDispose, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const MAX_IMAGE_COUNT = 4
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const MAX_IMAGE_EDGE = 1920

async function compressImage(file: File): Promise<File> {
  if (file.type === 'image/gif')
    return file

  const image = new Image()
  const source = URL.createObjectURL(file)
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Image could not be decoded'))
      image.src = source
    })
    if (file.size <= MAX_IMAGE_BYTES && image.width <= MAX_IMAGE_EDGE && image.height <= MAX_IMAGE_EDGE)
      return file

    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    let edge = MAX_IMAGE_EDGE
    let result = file
    while (edge >= 100) {
      const scale = Math.min(1, edge / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, outputType, outputType === 'image/jpeg' ? 0.85 : undefined))
      if (!blob)
        break
      result = new File([blob], file.name, { type: blob.type, lastModified: file.lastModified })
      if (result.size <= MAX_IMAGE_BYTES)
        return result
      edge = Math.round(edge * 0.8)
    }
    return result
  }
  catch {
    return file
  }
  finally {
    URL.revokeObjectURL(source)
  }
}

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
    }

    const nextImageCount = composer.attachments.value.length + reservedImageCount + files.length
    if (nextImageCount > MAX_IMAGE_COUNT) {
      error.value = t('stage.chat.images.too-many', { count: MAX_IMAGE_COUNT })
      return
    }

    // Reserve the number of slots before decoding. Image decoding is asynchronous,
    // so a concurrent paste must see the in-flight picker batch.
    reservedImageCount += files.length
    pending.value++
    const preparedFiles: File[] = []
    let batchBytes = 0
    let reservedBatchBytes = false
    try {
      for (const file of files)
        preparedFiles.push(await compressImage(file))
      if (preparedFiles.some(file => file.size > MAX_IMAGE_BYTES)) {
        error.value = t('stage.chat.images.too-large')
        return
      }

      batchBytes = preparedFiles.reduce((total, file) => total + file.size, 0)
      const aggregateBytes = composer.attachments.value.reduce((total, attachment) => total + attachment.file.size, 0)
        + reservedImageBytes
        + batchBytes
      if (aggregateBytes > MAX_IMAGE_BYTES) {
        error.value = t('stage.chat.images.total-too-large')
        return
      }
      reservedImageBytes += batchBytes
      reservedBatchBytes = true
      const images: ChatImageAttachment[] = []
      for (const file of preparedFiles) {
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
        if (reservedBatchBytes)
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
