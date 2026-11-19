import type { AssistantTurn } from '../messages/types'
import type { ResolvedStep } from './request-context'

/** Carries completed tool rounds to a new continuation scope without persisting a partial turn. */
export class RequestSwitch extends Error {
  constructor(
    readonly next: ResolvedStep,
    readonly partialTurn: AssistantTurn,
  ) {
    super('Model request scope changed')
  }
}
