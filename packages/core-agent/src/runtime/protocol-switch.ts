import type { AssistantTurn } from '../messages/types'
import type { StreamOptions } from '../types/llm'

type StepSettings = Awaited<ReturnType<NonNullable<StreamOptions['resolveStep']>>>

/** Carries completed tool rounds to the next protocol without persisting a partial turn. */
export class ProtocolSwitch extends Error {
  constructor(
    readonly next: StepSettings,
    readonly partialTurn: AssistantTurn,
  ) {
    super('Model protocol changed after a tool step')
  }
}
