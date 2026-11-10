import type { Tool, ToolExecuteResult } from '@xsai/shared-chat'

import * as v from 'valibot'

/** Reads one image with the vision model and returns its text description for the chat model. */
export type DescribeToolImage = (imageUrl: string) => Promise<string>

const imageUrlPartSchema = v.object({
  type: v.literal('image_url'),
  image_url: v.object({ url: v.string() }),
})

const mcpImageSchema = v.object({
  type: v.literal('image'),
  data: v.string(),
  mimeType: v.string(),
})

const mcpResultSchema = v.looseObject({
  content: v.array(v.unknown()),
})

const DESCRIPTION_START = '[Image description from the vision model]'
const DESCRIPTION_END = '[End image description]'
const DESCRIPTION_FAILED = 'The vision model failed to read this image.'

/**
 * Reads the text part that replaced a tool image.
 *
 * Returns the description, `{ failed: true }` when the vision model could not read the image,
 * and `undefined` for any other text.
 *
 * @example
 * parseToolImageDescription('[Image description from the vision model]\nA desktop.\n[End image description]')
 * // => { description: 'A desktop.' }
 */
export function parseToolImageDescription(text: string): { description: string } | { failed: true } | undefined {
  if (text === DESCRIPTION_FAILED)
    return { failed: true }
  if (text.startsWith(`${DESCRIPTION_START}\n`) && text.endsWith(`\n${DESCRIPTION_END}`))
    return { description: text.slice(DESCRIPTION_START.length + 1, -(DESCRIPTION_END.length + 1)) }
  return undefined
}

/** Replaces one image part with its description. A text part replaces an unreadable image. */
async function describePart(part: unknown, describe: DescribeToolImage, abortSignal?: AbortSignal): Promise<unknown> {
  let imageUrl: string
  if (v.is(imageUrlPartSchema, part))
    imageUrl = part.image_url.url
  else if (v.is(mcpImageSchema, part))
    imageUrl = `data:${part.mimeType};base64,${part.data}`
  else
    return part

  let description: string
  try {
    description = (await describe(imageUrl)).trim()
  }
  catch (error) {
    abortSignal?.throwIfAborted()
    console.warn('[llm] The vision model failed to read a tool image:', error)
    description = ''
  }

  return {
    type: 'text',
    text: description
      ? `${DESCRIPTION_START}\n${description}\n${DESCRIPTION_END}`
      : DESCRIPTION_FAILED,
  }
}

async function describeParts(parts: unknown[], describe: DescribeToolImage, abortSignal?: AbortSignal) {
  // The vision inference queue limits how many images are read at once.
  return await Promise.all(parts.map(part => describePart(part, describe, abortSignal)))
}

async function describeResultImages(result: ToolExecuteResult, describe: DescribeToolImage, abortSignal?: AbortSignal): Promise<ToolExecuteResult> {
  if (Array.isArray(result))
    return await describeParts(result, describe, abortSignal)
  if (v.is(mcpResultSchema, result))
    return { ...result, content: await describeParts(result.content, describe, abortSignal) }
  return result
}

/**
 * Replaces the images in the results of a tool with text descriptions.
 *
 * Use when:
 * - The chat provider does not report image input, and a vision model reads the images.
 *
 * Covers xsAI `image_url` parts, such as a computer-use screenshot, and MCP
 * `image` content. A description keeps the text and the layout of an image,
 * but not its pixel positions.
 */
export function withDescribedImages(tool: Tool, describe: DescribeToolImage): Tool {
  return {
    ...tool,
    async execute(input, options) {
      return await describeResultImages(await tool.execute(input, options), describe, options.abortSignal)
    },
  }
}
