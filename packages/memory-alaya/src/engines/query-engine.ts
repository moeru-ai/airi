import type { QueryEngineInput } from '../contracts/v1'
import type { RunQueryEngineDeps } from '../use-cases/run-query-engine'

import { runQueryEngine } from '../use-cases/run-query-engine'

export interface QueryEngine {
  execute: (input: QueryEngineInput) => ReturnType<typeof runQueryEngine>
}

export function createQueryEngine(deps: RunQueryEngineDeps): QueryEngine {
  return {
    execute(input) {
      return runQueryEngine(input, deps)
    },
  }
}
