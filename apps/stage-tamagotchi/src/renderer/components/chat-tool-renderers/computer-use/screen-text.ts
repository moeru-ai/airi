import type { ToolResultCoverage } from '@proj-airi/stage-ui/components'

import type { ComputerUseCommandReader } from './view'

import { boolean, looseObject, number, optional, record, safeParse, string } from 'valibot'

import { COORDINATE_SPACE_OMITTED, INPUT_ACTION_SHOWN, InputActionSchema, PointSchema, TextMatchesSchema, WindowSchema } from './schemas'

/** The window line of a text card shows the title, the app, and the frame of the window. */
const WINDOW_LINE_SHOWN = { title: true, app_name: true, frame: true } satisfies ToolResultCoverage

const FindTextSchema = looseObject({ matches: TextMatchesSchema, window: optional(WindowSchema) })
const ClickTextSchema = looseObject({
  matches: TextMatchesSchema,
  point: PointSchema,
  action: InputActionSchema,
  window: optional(WindowSchema),
  selected_index: optional(number()),
  options: optional(looseObject({ button: string(), click: string(), modifiers: record(string(), boolean()), policy: string(), window_strategy: string() })),
})

const readFindText: ComputerUseCommandReader = (result, invocation) => {
  const parsed = safeParse(FindTextSchema, result)
  if (!parsed.success)
    return undefined
  const { matches, window } = parsed.output
  return {
    view: { kind: 'matches', query: invocation.positional[0] ?? '', matches: Array.isArray(matches) ? matches : matches.matches, window },
    // The match list shows the text, the place, and the confidence of every match.
    shown: { result: { matches: true, window: WINDOW_LINE_SHOWN } },
    omitted: { result: { window: COORDINATE_SPACE_OMITTED } },
  }
}

const readClickText: ComputerUseCommandReader = (result, invocation) => {
  const parsed = safeParse(ClickTextSchema, result)
  if (!parsed.success)
    return undefined
  const { matches, point, action, window, selected_index: selectedIndex, options } = parsed.output
  return {
    view: {
      kind: 'click-text',
      query: invocation.positional[0] ?? '',
      matches: Array.isArray(matches) ? matches : matches.matches,
      point,
      selectedIndex,
      options: options && {
        button: options.button,
        click: options.click,
        modifiers: Object.entries(options.modifiers).filter(([, held]) => held).map(([key]) => key),
        policy: options.policy,
        windowStrategy: options.window_strategy,
      },
      window,
      action,
    },
    shown: {
      result: {
        matches: true,
        point: true,
        action: INPUT_ACTION_SHOWN,
        window: WINDOW_LINE_SHOWN,
        selected_index: true,
        options: { button: true, click: true, modifiers: true, policy: true, window_strategy: true },
      },
    },
    omitted: { result: { window: COORDINATE_SPACE_OMITTED } },
  }
}

/** Finding, waiting for, and clicking text on the screen or in a window. */
export const screenTextReaders: Record<string, ComputerUseCommandReader> = {
  'screen.findText': readFindText,
  'screen.waitForText': readFindText,
  'window.findText': readFindText,
  'window.waitForText': readFindText,
  'screen.clickText': readClickText,
  'window.clickText': readClickText,
}
