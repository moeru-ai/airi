import type { ToolResultCoverage } from '@proj-airi/stage-ui/components'

import type { ComputerUseInvocation, ComputerUseKeyboardSpec } from './invocation'
import type {
  ComputerUseArtifact,
  ComputerUseCapture,
  ComputerUseDisplay,
  ComputerUseInputAction,
  ComputerUseMediaState,
  ComputerUsePoint,
  ComputerUseTextMatch,
  ComputerUseWindow,
} from './schemas'

/** What a card shows below its header, for each kind of AUV command. */
export type ComputerUseView
  = | { kind: 'capture', capture: ComputerUseCapture, display?: ComputerUseDisplay, window?: ComputerUseWindow, files: ComputerUseArtifact[] }
    | { kind: 'displays', displays: ComputerUseDisplay[] }
    | { kind: 'windows', windows: ComputerUseWindow[] }
    | { kind: 'matches', query: string, matches: ComputerUseTextMatch[], window?: ComputerUseWindow }
    | {
      kind: 'click-text'
      query: string
      matches: ComputerUseTextMatch[]
      point: ComputerUsePoint
      selectedIndex?: number
      options?: { button: string, click: string, modifiers: string[], policy: string, windowStrategy: string }
      window?: ComputerUseWindow
      action: ComputerUseInputAction
    }
    | { kind: 'text', mode: 'type' | 'paste', text: string, action: ComputerUseInputAction }
    | { kind: 'keys', keys: string[], count?: string, intervalMs?: string, durationMs?: string, action: ComputerUseInputAction }
    | { kind: 'keyboard', steps: Array<{ spec?: ComputerUseKeyboardSpec, action: ComputerUseInputAction }> }
    | { kind: 'focus', query: string, app: string, pid: number, role: string, title: string, value: string, path: string, action: ComputerUseInputAction }
    | { kind: 'move', point: ComputerUsePoint, action: ComputerUseInputAction }
    | {
      kind: 'click'
      requested: ComputerUsePoint
      onScreen: ComputerUsePoint
      relativeTo: string
      normalized: boolean
      button: string
      count?: string
      modifiers: string[]
      action: ComputerUseInputAction
    }
    | {
      kind: 'drag'
      requestedStart: ComputerUsePoint
      requestedEnd: ComputerUsePoint
      start: ComputerUsePoint
      end: ComputerUsePoint
      final: ComputerUsePoint
      relativeTo: string
      normalized: boolean
      button: string
      durationMs: number
      action: ComputerUseInputAction
    }
    | { kind: 'activate', requested: string, observed: string, verification: string }
    | { kind: 'permissions', permissions: Array<{ name: string, status: string }> }
    | { kind: 'now-playing', state: ComputerUseMediaState }
    | { kind: 'media', command: string, verified: boolean, before: ComputerUseMediaState, after: ComputerUseMediaState }

/** The view of one kind. */
export type ComputerUseViewOf<TKind extends ComputerUseView['kind']> = Extract<ComputerUseView, { kind: TKind }>

/**
 * What a command reader gives the card: the view, and which fields of the AUV `output` the view shows or leaves out on purpose.
 * The coverages name fields of `output`, such as `result` and `artifacts`.
 */
export interface ComputerUseCommandReading {
  view: ComputerUseView
  shown: Record<string, ToolResultCoverage>
  omitted?: Record<string, ToolResultCoverage>
}

/** Reads the result of one AUV command into its view. It returns `undefined` when the result is not of that command. */
export type ComputerUseCommandReader = (result: unknown, invocation: ComputerUseInvocation, artifacts: ComputerUseArtifact[]) => ComputerUseCommandReading | undefined
