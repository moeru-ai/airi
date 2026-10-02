import type { Tool } from '@xsai/shared-chat'

import { rawTool } from '@xsai/tool'

/** Tool that a conversation run calls to choose silence. The runtime records the choice, not a reply. */
export const STAY_QUIET_TOOL_NAME = 'builtIn_stayQuiet'

/** Guidance for requests that offer silence. */
export const STAY_QUIET_TOOLSET_PROMPT = [
  `You can choose not to reply. When silence fits better than any reply, call ${STAY_QUIET_TOOL_NAME} and write nothing else.`,
  'Silence is a choice, not an error. Never use it to hide a failure, or a refusal that the other person needs to hear.',
].join('\n')

/** Reads the reason from the tool arguments. A malformed argument keeps the choice and drops the reason. */
export function stayQuietReason(args: string): string | undefined {
  try {
    const parsed = JSON.parse(args) as { reason?: unknown }
    return typeof parsed.reason === 'string' ? parsed.reason : undefined
  }
  catch {
    return undefined
  }
}

/** Creates the silence tool. It only acknowledges the choice. The runtime acts on the tool call. */
export function createStayQuietTool(): Tool {
  return rawTool({
    name: STAY_QUIET_TOOL_NAME,
    description: 'Choose not to reply to this turn. Write no reply after calling it.',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'A short private note on why silence fits. Nobody else sees it.' } },
      required: ['reason'],
      additionalProperties: false,
    },
    execute: async () => 'Silence recorded. Write no reply.',
  })
}
