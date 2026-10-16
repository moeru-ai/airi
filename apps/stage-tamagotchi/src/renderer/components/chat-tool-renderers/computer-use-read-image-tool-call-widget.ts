import type { ChatToolCallWidget } from '@proj-airi/stage-ui/components'

import { readToolResult } from '@proj-airi/stage-ui/components'
import { parseToolImageDescription } from '@proj-airi/stage-ui/stores/ai/chat-llm/tool-images'
import { array, looseObject, minLength, optional, parseJson, pipe, safeParse, string } from 'valibot'

import ComputerUseReadImageToolCallWidget from './computer-use-read-image-tool-call-widget.vue'

// The tool returns content parts. A chat model that can see images gets the screenshot as an image part.
// A chat model that cannot gets a text part from the vision model in its place. A failed call returns an error text, which the schema rejects.
const ResultPartsSchema = pipe(array(looseObject({
  type: string(),
  image_url: optional(looseObject({ url: string() })),
  text: optional(string()),
})), minLength(1))

const ArgumentsSchema = pipe(string(), parseJson(), looseObject({ path: string() }))

/** One text part of the result: the description of the vision model, its failure, or other text. */
function readText(text: string) {
  const described = parseToolImageDescription(text)
  if (!described)
    return { kind: 'text', text } as const
  return 'failed' in described ? { kind: 'failed' } as const : { kind: 'description', text: described.description } as const
}

/** Shows the screenshot that a read image call read, and the description that replaced it for a chat model without vision. */
export const computerUseReadImageToolCallWidget: ChatToolCallWidget = {
  component: ComputerUseReadImageToolCallWidget,
  read: (result, args) => {
    const input = safeParse(ArgumentsSchema, args)
    return readToolResult(ResultPartsSchema, result, parts => ({
      path: input.success ? input.output.path : undefined,
      urls: parts.flatMap(part => part.image_url ? [part.image_url.url] : []),
      texts: parts.flatMap(part => part.text === undefined ? [] : [readText(part.text)]),
    }))
  },
}
