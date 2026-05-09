import { createObjectUrlFromBytes } from './create-object-url-from-bytes'

export interface ChatImageAttachment {
  type: 'image'
  data: string
  mimeType: string
  url: string
}

export function createObjectUrlFromBase64(data: string, mimeType: string): string {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return createObjectUrlFromBytes(bytes, mimeType)
}

export function recreateAttachmentObjectUrls(attachments: ChatImageAttachment[]): ChatImageAttachment[] {
  return attachments.map(attachment => ({
    ...attachment,
    url: createObjectUrlFromBase64(attachment.data, attachment.mimeType),
  }))
}

export function revokeAttachmentObjectUrls(attachments: ChatImageAttachment[]): void {
  for (const attachment of attachments) {
    URL.revokeObjectURL(attachment.url)
  }
}
