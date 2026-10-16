import type { ToolResultCoverage } from '@proj-airi/stage-ui/components'

import type { ComputerUseCommandReader } from './view'

import { defineToolCallWidget, restOf } from '@proj-airi/stage-ui/components'
import { array, looseObject, number, optional, parseJson, pipe, safeParse, string, transform, unknown } from 'valibot'

import ComputerUseToolCallWidget from './widget.vue'

import { appReaders } from './app'
import { captureReaders } from './capture'
import { inputReaders } from './input'
import { parseInvocation } from './invocation'
import { mediaReaders } from './media'
import { ArtifactSchema } from './schemas'
import { screenTextReaders } from './screen-text'

// NOTICE:
// The computer use tool throws when AUV exits with an error, so a failed command reaches the chat as an error text.
// The message is the AUV result as JSON, and two paths wrap it with their own prefix:
// a call in a reply goes through `createErrorToolResult` in node_modules/@xsai/shared-chat/dist/index.js (0.5.1),
// and a rerun goes through `executeToolCallRerun` in packages/stage-ui/src/stores/tool-call-rerun.ts.
// Remove the prefix handling when the tool keeps failed commands as structured results.
const ERROR_PREFIXES = ['Tool "computer_use" execution failed: ', 'Tool call error for "computer_use": ']

/** The AUV result of a finished or failed call. The text is parsed once, and each command reader validates only its `result`. */
const CallSchema = pipe(
  string(),
  transform((text) => {
    const prefix = ERROR_PREFIXES.find(candidate => text.startsWith(candidate))
    return prefix ? text.slice(prefix.length) : text
  }),
  parseJson(),
  looseObject({
    argv: array(string()),
    exitCode: number(),
    output: looseObject({
      status: string(),
      command_id: string(),
      result: optional(unknown()),
      artifacts: optional(array(ArtifactSchema)),
      failure: optional(string()),
      failure_details: optional(looseObject({ code: string(), message: string() })),
    }),
  }),
)

/** The card of each AUV command, by command family. A command without a card shows its header, and its result as other data. */
const COMMAND_READERS: Record<string, ComputerUseCommandReader> = {
  ...captureReaders,
  ...inputReaders,
  ...screenTextReaders,
  ...appReaders,
  ...mediaReaders,
}

/** The header shows the command and its status. */
const HEADER_SHOWN = { status: true, command_id: true } satisfies ToolResultCoverage
/** `argv` is the call itself, which the card reads as its invocation. `exitCode` repeats the status. */
const CALL_OMITTED = { argv: true, exitCode: true } satisfies ToolResultCoverage

/** Shows an AUV command with its status, and a card for what the command did. */
export const computerUseToolCallWidget = defineToolCallWidget(ComputerUseToolCallWidget, (result) => {
  const parsed = safeParse(CallSchema, result)
  if (!parsed.success)
    return undefined
  const call = parsed.output
  const { output } = call
  const header = { command: output.command_id, status: output.status }

  if (output.failure !== undefined) {
    return {
      props: { ...header, failure: { message: output.failure, code: output.failure_details?.code, detail: output.failure_details?.message } },
      rest: restOf(call, { output: { ...HEADER_SHOWN, failure: true, failure_details: { code: true, message: true } } }, CALL_OMITTED),
    }
  }

  const reading = COMMAND_READERS[output.command_id]?.(output.result, parseInvocation(call.argv), output.artifacts ?? [])
  if (!reading)
    return { props: header, rest: restOf(call, { output: HEADER_SHOWN }, CALL_OMITTED) }
  return {
    props: { ...header, view: reading.view },
    rest: restOf(call, { output: { ...HEADER_SHOWN, ...reading.shown } }, { ...CALL_OMITTED, ...(reading.omitted && { output: reading.omitted }) }),
  }
})
