import type { ToolResultCoverage } from '@proj-airi/stage-ui/components'

import type { ComputerUseCommandReader } from './view'

import { array, boolean, looseObject, number, safeParse, string } from 'valibot'

import { keyboardSpecs, lastFlag, listFlag } from './invocation'
import { INPUT_ACTION_SHOWN, InputActionSchema, POINT_SHOWN, PointSchema } from './schemas'

function readTextInput(mode: 'type' | 'paste'): ComputerUseCommandReader {
  return (result, invocation) => {
    const action = safeParse(InputActionSchema, result)
    if (!action.success)
      return undefined
    return { view: { kind: 'text', mode, text: invocation.positional.join(' '), action: action.output }, shown: { result: INPUT_ACTION_SHOWN } }
  }
}

/** The key commands take one key per argument, which can be `+` itself. */
const readKeys: ComputerUseCommandReader = (result, invocation) => {
  const action = safeParse(InputActionSchema, result)
  if (!action.success)
    return undefined
  return {
    view: {
      kind: 'keys',
      keys: invocation.positional,
      count: lastFlag(invocation, '--count'),
      intervalMs: lastFlag(invocation, '--interval-ms'),
      durationMs: lastFlag(invocation, '--duration-ms'),
      action: action.output,
    },
    shown: { result: INPUT_ACTION_SHOWN },
  }
}

const readFocus: ComputerUseCommandReader = (result) => {
  const parsed = safeParse(looseObject({ app: string(), pid: number(), path: string(), role: string(), title: string(), value: string(), query: string(), input_action_result: InputActionSchema }), result)
  if (!parsed.success)
    return undefined
  const focus = parsed.output
  return {
    view: { kind: 'focus', query: focus.query, app: focus.app, pid: focus.pid, role: focus.role, title: focus.title, value: focus.value, path: focus.path, action: focus.input_action_result },
    shown: { result: { app: true, pid: true, path: true, role: true, title: true, value: true, query: true, input_action_result: INPUT_ACTION_SHOWN } },
  }
}

/** The pointer cards show the delivery, and whether the point is normalized and what it is relative to. */
const POINTER_SHOWN = { action: INPUT_ACTION_SHOWN, normalized: true, relative_to: true } satisfies ToolResultCoverage

/** Typing, keys, focus, and the mouse. */
export const inputReaders: Record<string, ComputerUseCommandReader> = {
  'input.typeText': readTextInput('type'),
  'input.pasteText': readTextInput('paste'),
  'input.pressKeys': readKeys,
  'input.holdKeys': readKeys,
  'input.performKeyboardInputs': (result, invocation) => {
    const parsed = safeParse(looseObject({ actions: array(InputActionSchema) }), result)
    if (!parsed.success)
      return undefined
    const specs = keyboardSpecs(invocation)
    return {
      view: { kind: 'keyboard', steps: parsed.output.actions.map((action, index) => ({ spec: specs[index], action })) },
      shown: { result: { actions: [INPUT_ACTION_SHOWN] } },
    }
  },
  'accessibility.focusText': readFocus,
  'input.moveMouse': (result) => {
    const parsed = safeParse(looseObject({ point: PointSchema, action: InputActionSchema }), result)
    if (!parsed.success)
      return undefined
    return { view: { kind: 'move', point: parsed.output.point, action: parsed.output.action }, shown: { result: { point: POINT_SHOWN, action: INPUT_ACTION_SHOWN } } }
  },
  'input.clickPoint': (result, invocation) => {
    const parsed = safeParse(looseObject({ action: InputActionSchema, normalized: boolean(), relative_to: string(), requested_point: PointSchema, screen_point: PointSchema }), result)
    if (!parsed.success)
      return undefined
    const click = parsed.output
    return {
      view: {
        kind: 'click',
        requested: click.requested_point,
        onScreen: click.screen_point,
        relativeTo: click.relative_to,
        normalized: click.normalized,
        // AUV clicks with the left button unless the call names another one.
        button: lastFlag(invocation, '--button') ?? 'left',
        count: lastFlag(invocation, '--click-count'),
        modifiers: listFlag(invocation, '--modifiers'),
        action: click.action,
      },
      shown: { result: { ...POINTER_SHOWN, requested_point: POINT_SHOWN, screen_point: POINT_SHOWN } },
    }
  },
  'input.dragMouse': (result) => {
    const parsed = safeParse(looseObject({
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
    }), result)
    if (!parsed.success)
      return undefined
    const drag = parsed.output
    return {
      view: {
        kind: 'drag',
        requestedStart: drag.requested_start,
        requestedEnd: drag.requested_end,
        start: drag.screen_start,
        end: drag.screen_end,
        final: drag.final_point,
        relativeTo: drag.relative_to,
        normalized: drag.normalized,
        button: drag.button,
        durationMs: drag.duration_ms,
        action: drag.action,
      },
      shown: {
        result: {
          ...POINTER_SHOWN,
          button: true,
          duration_ms: true,
          final_point: POINT_SHOWN,
          requested_start: POINT_SHOWN,
          requested_end: POINT_SHOWN,
          screen_start: POINT_SHOWN,
          screen_end: POINT_SHOWN,
        },
      },
    }
  },
}
