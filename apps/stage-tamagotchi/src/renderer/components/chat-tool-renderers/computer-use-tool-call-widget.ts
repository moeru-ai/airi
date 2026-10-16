import type { ChatToolCallWidget } from '@proj-airi/stage-ui/components'
import type { GenericSchema, InferOutput } from 'valibot'

import type { ComputerUseKeyboardStep, ComputerUseView, ComputerUseWindow } from './computer-use-tool-call-view'

import { readToolResult } from '@proj-airi/stage-ui/components'
import { array, boolean, literal, looseObject, null_, nullable, number, optional, parseJson, pipe, record, safeParse, string, transform, union, unknown } from 'valibot'

import ComputerUseToolCallWidget from './computer-use-tool-call-widget.vue'

// The fields below are the ones AUV 0.0.28 prints with `--json`, read from a run of every invoke command.
// A field that a schema does not name shows under the card as other data.

const PointSchema = looseObject({ x: number(), y: number() })
const SizeSchema = looseObject({ width: number(), height: number() })
const RectSchema = looseObject({ origin: PointSchema, size: SizeSchema })

const InputActionSchema = looseObject({
  attempts: array(looseObject({ path: string(), succeeded: boolean(), message: nullable(string()) })),
  selected_path: string(),
  mouse_disturbance: string(),
  focus_disturbance: string(),
  clipboard_disturbance: string(),
  verified: boolean(),
})

const TextMatchSchema = looseObject({ text: string(), confidence: number(), bounds: RectSchema })
// `screen.findText` lists its matches directly. The window commands and the click commands nest them one level deeper.
const TextMatchesSchema = union([array(TextMatchSchema), looseObject({ matches: array(TextMatchSchema) })])

// `coordinate_space` names the space of the frame, which the card prints as screen coordinates.
const WindowSchema = looseObject({
  app_name: string(),
  app_bundle_id: nullable(string()),
  title: string(),
  process_id: number(),
  is_main: boolean(),
  is_visible: boolean(),
  reference: looseObject({ id: string() }),
  frame: RectSchema,
  coordinate_space: string(),
})

const DisplaySchema = looseObject({
  id: string(),
  name: string(),
  is_builtin: boolean(),
  is_primary: boolean(),
  scale_factor: number(),
  frame: RectSchema,
  coordinate_space: string(),
})

const CaptureSchema = looseObject({
  backend: string(),
  bounds: RectSchema,
  pixel_dimensions: SizeSchema,
  scale_factor: number(),
  fallback_reason: nullable(string()),
})

// `schema_version` names the shape of this record, not a property of the media.
const MediaStateSchema = looseObject({
  present: boolean(),
  is_playing: boolean(),
  playback_rate: number(),
  title: optional(nullable(string())),
  artist: optional(nullable(string())),
  album: optional(nullable(string())),
  source_bundle_id: optional(nullable(string())),
  duration_seconds: optional(nullable(number())),
  elapsed_seconds: optional(nullable(number())),
  is_liked: optional(nullable(boolean())),
  supports_like: optional(nullable(boolean())),
  schema_version: optional(string()),
})

const ArtifactSchema = looseObject({ file_path: string(), file_extension: string(), byte_length: number() })

/** AUV CLI flags that take no value. Every other flag takes the token after it. */
const VALUELESS_FLAGS = new Set(['--normalized', '--dry-run', '--no-overlay', '--json', '--detail', '--wide'])

/** Splits the argv of an AUV call into positional arguments and flags. `argv[0]` is `invoke`, and `argv[1]` is the command. */
function splitArgv(argv: string[]) {
  const positional: string[] = []
  const flags: Record<string, string> = {}
  for (let index = 2; index < argv.length; index++) {
    const token = argv[index]!
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }
    const [flag, inline] = token.split(/=(.*)/s)
    const next = argv[index + 1]
    if (inline !== undefined)
      flags[flag!] = inline
    else if (VALUELESS_FLAGS.has(flag!) || next === undefined || next.startsWith('--'))
      flags[flag!] = 'true'
    else
      flags[flag!] = argv[++index]!
  }
  return { positional, flags }
}

function toWindow(window: InferOutput<typeof WindowSchema>): ComputerUseWindow {
  const { reference, ...rest } = window
  return { ...rest, id: reference.id }
}

function toMatches(matches: InferOutput<typeof TextMatchesSchema>) {
  return Array.isArray(matches) ? matches : matches.matches
}

/** The steps that `input.keyboard` was asked to run, from its `--actions` JSON. */
function keyboardSpecs(actions: string | undefined): ComputerUseKeyboardStep['spec'][] {
  const specs = safeParse(pipe(string(), parseJson(), array(unknown())), actions)
  if (!specs.success)
    return []
  return specs.output.map((spec) => {
    const press = safeParse(looseObject({ kind: literal('press'), keys: array(string()) }), spec)
    if (press.success)
      return { kind: 'press', keys: press.output.keys }
    const type = safeParse(looseObject({ kind: literal('type_text'), text: string() }), spec)
    if (type.success)
      return { kind: 'type_text', text: type.output.text }
    return { kind: 'other', text: JSON.stringify(spec) }
  })
}

/** The card of one command: the schema of its `result`, and the view it reads from the result and the argv. */
interface CommandView<TSchema extends GenericSchema> {
  result: TSchema
  // A method, so a view of one command fits the table of all views.
  toView: (result: InferOutput<TSchema>, argv: string[], artifacts: InferOutput<typeof ArtifactSchema>[]) => ComputerUseView
}

function defineView<TSchema extends GenericSchema>(view: CommandView<TSchema>) {
  return view
}

function toCapture(capture: InferOutput<typeof CaptureSchema>) {
  return { backend: capture.backend, bounds: capture.bounds, pixelSize: capture.pixel_dimensions, scale: capture.scale_factor, fallbackReason: capture.fallback_reason }
}

function toFiles(artifacts: InferOutput<typeof ArtifactSchema>[]) {
  return artifacts.map(artifact => ({ path: artifact.file_path, extension: artifact.file_extension, bytes: artifact.byte_length }))
}

const displayCaptureView = defineView({
  result: looseObject({ capture: CaptureSchema, display: DisplaySchema }),
  toView: ({ capture, display }, _argv, artifacts) => ({ kind: 'capture', capture: toCapture(capture), display, files: toFiles(artifacts) }),
})

const textMatchView = defineView({
  result: looseObject({ matches: TextMatchesSchema, window: optional(WindowSchema) }),
  toView: ({ matches, window }, argv) => ({
    kind: 'matches',
    query: splitArgv(argv).positional[0] ?? '',
    matches: toMatches(matches),
    window: window && toWindow(window),
  }),
})

const clickTextView = defineView({
  result: looseObject({
    matches: TextMatchesSchema,
    point: PointSchema,
    action: InputActionSchema,
    window: optional(WindowSchema),
    selected_index: optional(number()),
    options: optional(looseObject({ button: string(), click: string(), modifiers: record(string(), boolean()), policy: string(), window_strategy: string() })),
  }),
  toView: ({ matches, point, action, window, selected_index: selectedIndex, options }, argv) => ({
    kind: 'click-text',
    query: splitArgv(argv).positional[0] ?? '',
    matches: toMatches(matches),
    point,
    selectedIndex,
    options: options && {
      button: options.button,
      click: options.click,
      modifiers: Object.entries(options.modifiers).filter(([, held]) => held).map(([key]) => key),
      policy: options.policy,
      windowStrategy: options.window_strategy,
    },
    window: window && toWindow(window),
    action,
  }),
})

function textInputView(mode: 'type' | 'paste') {
  return defineView({
    result: InputActionSchema,
    toView: (action, argv) => ({ kind: 'text', mode, text: splitArgv(argv).positional.join(' '), action }),
  })
}

const keysView = defineView({
  result: InputActionSchema,
  toView: (action, argv) => {
    const { positional, flags } = splitArgv(argv)
    return {
      kind: 'keys',
      // `input.key` takes one shortcut such as `cmd+f`. The other key commands take one key per argument.
      keys: positional.flatMap(key => key.split('+')),
      count: flags['--count'],
      intervalMs: flags['--interval-ms'],
      durationMs: flags['--duration-ms'],
      action,
    }
  },
})

const focusView = defineView({
  result: looseObject({ app: string(), pid: number(), path: string(), role: string(), title: string(), value: string(), query: string(), input_action_result: InputActionSchema }),
  toView: result => ({ kind: 'focus', query: result.query, app: result.app, pid: result.pid, role: result.role, title: result.title, value: result.value, path: result.path, action: result.input_action_result }),
})

const mediaControlView = defineView({
  result: looseObject({ command: string(), verified: boolean(), before: MediaStateSchema, after: MediaStateSchema }),
  toView: result => ({ kind: 'media', command: result.command, verified: result.verified, before: result.before, after: result.after }),
})

/** The card of each AUV command. A command without one shows its header, and its result as other data. */
const COMMAND_VIEWS: Record<string, CommandView<GenericSchema>> = {
  'display.capture': displayCaptureView,
  'screen.captureRegion': displayCaptureView,
  'window.capture': defineView({
    result: looseObject({ capture: CaptureSchema, window: WindowSchema }),
    toView: ({ capture, window }, _argv, artifacts) => ({ kind: 'capture', capture: toCapture(capture), window: toWindow(window), files: toFiles(artifacts) }),
  }),
  'display.list': defineView({
    result: looseObject({ displays: array(DisplaySchema) }),
    toView: ({ displays }) => ({ kind: 'displays', displays }),
  }),
  'window.list': defineView({
    result: array(WindowSchema),
    toView: windows => ({ kind: 'windows', windows: windows.map(toWindow) }),
  }),
  'screen.findText': textMatchView,
  'screen.waitForText': textMatchView,
  'window.findText': textMatchView,
  'window.waitForText': textMatchView,
  'screen.clickText': clickTextView,
  'window.clickText': clickTextView,
  'input.typeText': textInputView('type'),
  'input.pasteText': textInputView('paste'),
  'input.key': keysView,
  'input.keys': keysView,
  'input.pressKeys': keysView,
  'input.holdKeys': keysView,
  'input.keyboard': defineView({
    result: looseObject({ actions: array(InputActionSchema) }),
    toView: ({ actions }, argv) => {
      const specs = keyboardSpecs(splitArgv(argv).flags['--actions'])
      return { kind: 'keyboard', steps: actions.map((action, index) => ({ spec: specs[index], action })) }
    },
  }),
  'input.focusText': focusView,
  'input.axFocusText': focusView,
  'input.moveMouse': defineView({
    result: looseObject({ point: PointSchema, action: InputActionSchema }),
    toView: ({ point, action }) => ({ kind: 'move', point, action }),
  }),
  'input.clickPoint': defineView({
    result: looseObject({ action: InputActionSchema, normalized: boolean(), relative_to: string(), requested_point: PointSchema, screen_point: PointSchema }),
    toView: (result, argv) => {
      const { flags } = splitArgv(argv)
      return {
        kind: 'click',
        requested: result.requested_point,
        onScreen: result.screen_point,
        relativeTo: result.relative_to,
        normalized: result.normalized,
        // AUV clicks with the left button unless the call names another one.
        button: flags['--button'] ?? 'left',
        count: flags['--click-count'],
        modifiers: flags['--modifiers']?.split(',') ?? [],
        action: result.action,
      }
    },
  }),
  'input.drag': defineView({
    result: looseObject({
      action: InputActionSchema,
      button: string(),
      duration_ms: number(),
      final_point: PointSchema,
      normalized: boolean(),
      relative_to: string(),
      requested_start: PointSchema,
      requested_end: PointSchema,
      screen_start: PointSchema,
      screen_end: PointSchema,
    }),
    toView: result => ({
      kind: 'drag',
      requestedStart: result.requested_start,
      requestedEnd: result.requested_end,
      start: result.screen_start,
      end: result.screen_end,
      final: result.final_point,
      relativeTo: result.relative_to,
      normalized: result.normalized,
      button: result.button,
      durationMs: result.duration_ms,
      action: result.action,
    }),
  }),
  'app.activate': defineView({
    result: looseObject({ requested_bundle_id: string(), verification: looseObject({ observed_bundle_id: string(), status: string() }) }),
    toView: result => ({ kind: 'activate', requested: result.requested_bundle_id, observed: result.verification.observed_bundle_id, verification: result.verification.status }),
  }),
  'app.probePermissions': defineView({
    result: record(string(), string()),
    toView: permissions => ({ kind: 'permissions', permissions: Object.entries(permissions).map(([name, status]) => ({ name, status })) }),
  }),
  'mediaControl.nowPlaying': defineView({
    result: MediaStateSchema,
    toView: state => ({ kind: 'now-playing', state }),
  }),
  'mediaControl.play': mediaControlView,
  'mediaControl.pause': mediaControlView,
  'mediaControl.togglePlayPause': mediaControlView,
  'mediaControl.next': mediaControlView,
  'mediaControl.previous': mediaControlView,
}

// NOTICE:
// The computer use tool throws when AUV exits with an error, so a failed command reaches the chat as an error text.
// xsAI wraps the thrown message as `Tool "<name>" execution failed: <message>`, and the message is the AUV result as JSON.
// Source: `createErrorToolResult` in node_modules/@xsai/shared-chat/dist/index.js (0.5.1).
// Remove the prefix handling when the tool returns failed commands as results instead of throwing.
const ERROR_PREFIX = 'Tool "computer_use" execution failed: '

/** The AUV result as JSON text, from a finished call or from a failed one. */
const ResultTextSchema = pipe(string(), transform(text => text.startsWith(ERROR_PREFIX) ? text.slice(ERROR_PREFIX.length) : text))

// `argv` is the call itself, and `exitCode` repeats the status, so the header covers both.
function envelope(output: Record<string, GenericSchema>) {
  return pipe(ResultTextSchema, parseJson(), looseObject({
    argv: array(string()),
    exitCode: number(),
    output: looseObject({ status: string(), command_id: string(), ...output }),
  }))
}

const CommandSchema = envelope({})
const FailedSchema = envelope({
  status: literal('failed'),
  result: null_(),
  failure: string(),
  failure_details: optional(looseObject({ code: string(), message: string() })),
})

/** Shows an AUV command with its status, and a card for what the command did. */
export const computerUseToolCallWidget: ChatToolCallWidget = {
  component: ComputerUseToolCallWidget,
  read: (result) => {
    const failed = readToolResult(FailedSchema, result, ({ output }) => ({
      command: output.command_id,
      status: output.status,
      failure: { message: output.failure, code: output.failure_details?.code },
    }))
    if (failed)
      return failed

    const command = safeParse(CommandSchema, result)
    const view = command.success ? COMMAND_VIEWS[command.output.output.command_id] : undefined
    const read = view && readToolResult(
      envelope({ result: view.result, artifacts: optional(array(ArtifactSchema)) }),
      result,
      ({ argv, output }) => ({ command: output.command_id, status: output.status, view: view.toView(output.result, argv, output.artifacts ?? []) }),
    )
    return read ?? readToolResult(CommandSchema, result, ({ output }) => ({ command: output.command_id, status: output.status }))
  },
}
