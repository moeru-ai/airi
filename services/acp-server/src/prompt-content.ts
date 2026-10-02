import type { ContentBlock } from '@agentclientprotocol/sdk'

import { RequestError } from '@agentclientprotocol/sdk'

export interface PromptContent {
  text: string
  attachments: { type: 'image', data: string, mimeType: string }[]
}

/** Turns ACP prompt blocks into the user text and image attachments the runtime stores. */
export function promptContent(blocks: ContentBlock[]): PromptContent {
  const lines: string[] = []
  const attachments: PromptContent['attachments'] = []

  for (const block of blocks) {
    if (block.type === 'text') {
      lines.push(block.text)
      continue
    }
    if (block.type === 'image') {
      attachments.push({ type: 'image', data: block.data, mimeType: block.mimeType })
      continue
    }
    if (block.type === 'resource_link') {
      lines.push(`Resource: ${block.name} ${block.uri}`)
      continue
    }
    if (block.type === 'resource') {
      const resource = block.resource
      if ('text' in resource && typeof resource.text === 'string')
        lines.push(resource.text)
      else
        lines.push(`Embedded resource: ${resource.uri}`)
      continue
    }
    throw RequestError.invalidParams({ type: block.type }, 'Audio prompt blocks are not supported')
  }

  return { text: lines.join('\n'), attachments }
}
