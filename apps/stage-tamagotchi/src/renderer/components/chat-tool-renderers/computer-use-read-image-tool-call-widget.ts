import type { ChatToolCallWidget } from '@proj-airi/stage-ui/components'

import { readToolResult } from '@proj-airi/stage-ui/components'
import { array, literal, looseObject, minLength, parseJson, pipe, safeParse, string } from 'valibot'

import ComputerUseReadImageToolCallWidget from './computer-use-read-image-tool-call-widget.vue'

// The tool returns the screenshot as image content parts. A failed call returns an error text, which the schema rejects.
const ImagePartsSchema = pipe(array(looseObject({
  type: literal('image_url'),
  image_url: looseObject({ url: string() }),
})), minLength(1))

const ArgumentsSchema = pipe(string(), parseJson(), looseObject({ path: string() }))

/** Shows the screenshot that a read image call returned. */
export const computerUseReadImageToolCallWidget: ChatToolCallWidget = {
  component: ComputerUseReadImageToolCallWidget,
  read: (result, args) => {
    const input = safeParse(ArgumentsSchema, args)
    return readToolResult(ImagePartsSchema, result, parts => ({
      urls: parts.map(part => part.image_url.url),
      // The arguments name the file the screenshot came from.
      fileName: input.success ? input.output.path.split(/[\\/]/).at(-1) : undefined,
    }))
  },
}
