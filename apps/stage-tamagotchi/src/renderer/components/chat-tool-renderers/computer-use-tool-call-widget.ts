import type { ChatToolCallWidget } from '@proj-airi/stage-ui/components'

import { readToolResult } from '@proj-airi/stage-ui/components'
import { array, boolean, literal, looseObject, number, parseJson, pipe, string } from 'valibot'

import ComputerUseToolCallWidget from './computer-use-tool-call-widget.vue'

// The computer use tool returns the AUV result as a JSON string. A failed command throws, so its row shows the error text.
// `argv` is the call itself, and `exitCode` is always 0 here, so the status covers both.
const commandFields = { argv: array(string()), exitCode: number() }

/** Any AUV command. The card shows the command and its status, and its result shows as other data. */
const CommandSchema = pipe(string(), parseJson(), looseObject({
  ...commandFields,
  output: looseObject({ status: string(), command_id: string() }),
}))

const SizeSchema = looseObject({ width: number(), height: number() })

/** A screen capture. Fields that the card does not show, such as the run id and the checksum, show as other data. */
const DisplayCaptureSchema = pipe(string(), parseJson(), looseObject({
  ...commandFields,
  output: looseObject({
    status: string(),
    command_id: literal('display.capture'),
    result: looseObject({
      capture: looseObject({ backend: string(), bounds: looseObject({ size: SizeSchema }), pixel_dimensions: SizeSchema, scale_factor: number() }),
      display: looseObject({ name: string(), is_builtin: boolean(), is_primary: boolean() }),
    }),
    artifacts: array(looseObject({ file_path: string(), file_extension: string(), byte_length: number() })),
  }),
}))

/** Shows an AUV command with its status, and a screen capture as its screenshot and display. */
export const computerUseToolCallWidget: ChatToolCallWidget = {
  component: ComputerUseToolCallWidget,
  read: result => readToolResult(DisplayCaptureSchema, result, ({ output }) => ({
    command: output.command_id,
    status: output.status,
    capture: {
      display: output.result.display.name,
      builtIn: output.result.display.is_builtin,
      primary: output.result.display.is_primary,
      logicalSize: output.result.capture.bounds.size,
      pixelSize: output.result.capture.pixel_dimensions,
      scale: output.result.capture.scale_factor,
      backend: output.result.capture.backend,
    },
    files: output.artifacts.map(artifact => ({ path: artifact.file_path, extension: artifact.file_extension, bytes: artifact.byte_length })),
  }))
  ?? readToolResult(CommandSchema, result, ({ output }) => ({ command: output.command_id, status: output.status })),
}
