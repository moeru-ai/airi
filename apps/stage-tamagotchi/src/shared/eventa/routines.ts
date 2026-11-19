import type { Proposal, RoutineChange, RoutineCommand, RoutineView } from '@proj-airi/stage-ui/libs/routines/contracts'
import type { RoutineState } from '@proj-airi/stage-ui/libs/routines/model'

import type { RoutineWidgetMode } from '../routine-widgets'

import { defineInvokeEventa } from '@moeru/eventa'

export interface RoutineQueryView extends RoutineView {
  locale?: string
  visualStatus?: 'shown' | 'unavailable'
}
export const routinesQuery = defineInvokeEventa<RoutineQueryView, { view: RoutineWidgetMode }>('eventa:invoke:routines:query')

export const routinesRead = defineInvokeEventa<RoutineView>('eventa:invoke:routines:read')
export const routinesApply = defineInvokeEventa<RoutineState, RoutineCommand>('eventa:invoke:routines:apply')
export const routinesPropose = defineInvokeEventa<Proposal, RoutineChange>('eventa:invoke:routines:propose')
export const routinesConfirm = defineInvokeEventa<RoutineState, { id: string }>('eventa:invoke:routines:confirm')
