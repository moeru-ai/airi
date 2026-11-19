import type { ToolResultCoverage } from '@proj-airi/stage-ui/components'

import type { ComputerUseCommandReader, ComputerUseViewOf } from './view'

import { defineToolCallWidget, restOf } from '@proj-airi/stage-ui/components'
import { array, looseObject, number, optional, parseJson, pipe, safeParse, string, transform, unknown } from 'valibot'

import ComputerUseToolCallWidget from './widget.vue'

import { isComputerUseHelpCall } from '../../../../shared/eventa/computer-use'
import { appReaders } from './app'
import { captureReaders } from './capture'
import { parseAuvHelp } from './help'
import { inputReaders } from './input'
import { parseInvocation } from './invocation'
import { mediaReaders } from './media'
import { ArtifactSchema } from './schemas'
import { screenTextReaders } from './screen-text'

// NOTICE:
// A failed AUV command reaches the chat as error text, because the tool throws.
// xsAI and the rerun path each prefix the thrown AUV JSON.
// Source: `createErrorToolResult` in @xsai/shared-chat 0.5.1, and `executeToolCallRerun` in stores/tool-call-rerun.ts.
// Remove when the tool returns failed commands as results.
const ERROR_PREFIXES = ['Tool "computer_use" execution failed: ', 'Tool call error for "computer_use": ']

/**
 * The result of a computer use call. The text is parsed once.
 * `output` is help text for a help call, and the AUV run for any other call.
 */
const CallSchema = pipe(
  string(),
  transform((text) => {
    const prefix = ERROR_PREFIXES.find(candidate => text.startsWith(candidate))
    return prefix ? text.slice(prefix.length) : text
  }),
  parseJson(),
  looseObject({ argv: array(string()), exitCode: number(), output: unknown() }),
)

/** The AUV run of a call. Each command reader validates only its `result`. */
const RunSchema = looseObject({
  status: string(),
  command_id: string(),
  result: optional(unknown()),
  artifacts: optional(array(ArtifactSchema)),
  failure: optional(string()),
  failure_details: optional(looseObject({ code: string(), message: string() })),
})

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

  // The host runs a help call without `--json`, by the same rule, so its output is help text.
  if (isComputerUseHelpCall(call.argv) && typeof call.output === 'string') {
    const view: ComputerUseViewOf<'help'> = { kind: 'help', help: parseAuvHelp(call.output), text: call.output }
    return {
      props: { command: call.argv.join(' '), view },
      // The header shows the call, and the help view shows the whole text. `exitCode` says only that the help printed.
      rest: restOf(call, { argv: true, output: true }, { exitCode: true }),
    }
  }

  const run = safeParse(RunSchema, call.output)
  if (!run.success)
    return undefined
  const output = run.output
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
