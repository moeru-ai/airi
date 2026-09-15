import type { Message } from '@xsai/shared-chat'

/**
 * Replaces images only in the provider prompt. Local history keeps the originals.
 * Applies to every user turn, so later text-only turns and retries also work with
 * text-only chat models. Image descriptions are untrusted user content.
 */
export async function describeChatImages(messages: Message[], describe: (url: string, question: string) => Promise<string>): Promise<Message[]> {
  const projected: Message[] = []
  for (const message of messages) {
    if (message.role !== 'user' || typeof message.content === 'string') {
      projected.push(message)
      continue
    }
    const question = message.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
    const content = []
    for (const part of message.content) {
      if (part.type !== 'image_url') {
        content.push(part)
        continue
      }
      const description = await describe(part.image_url.url, question)
      if (!description.trim())
        throw new Error('The vision model returned no image description. Check Settings → Modules → Vision and try again.')
      content.push({ type: 'text' as const, text: `[Image description, supplied as user content]\n${description}\n[End image description]` })
    }
    projected.push({ ...message, content })
  }
  return projected
}
