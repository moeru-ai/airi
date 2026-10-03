import type { Tool } from '@xsai/shared-chat'

import { rawTool } from '@xsai/tool'
import { description, maxLength, pipe, safeParse, strictObject, string } from 'valibot'
import { toJsonSchema } from 'xsschema'

export const END_MODE_TOOL_NAME = 'builtIn_endMode'

const endModeParameters = strictObject({
  summary: pipe(string(), maxLength(500), description('One or two sentences for the main conversation: what happened in this mode and what is still open.')),
})

/**
 * Creates the tool that ends a handover mode. The chat returns to the main conversation, which receives the summary as a notice.
 */
export async function createEndModeTool(options: { end: (summary: string) => Promise<void> }): Promise<Tool[]> {
  return [
    rawTool({
      name: END_MODE_TOOL_NAME,
      description: 'End this mode when the owner asks, and hand the conversation back with a short summary.',
      parameters: await toJsonSchema(endModeParameters),
      execute: async (rawInput) => {
        const parsed = safeParse(endModeParameters, rawInput)
        await options.end(parsed.success ? parsed.output.summary.trim() : '')
        return 'The mode ended. Write nothing more.'
      },
    }),
  ]
}
