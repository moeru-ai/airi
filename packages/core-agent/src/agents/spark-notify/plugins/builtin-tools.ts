import type { SparkNotifyCommandDraft } from '../tools'
import type { SparkNotifyPlugin, SparkNotifyRuntimeEvent } from '../types'

import { createSparkNotifyTools } from '../tools'

/**
 * Adds the built-in no-response and Spark Command tools to each notify turn.
 */
export function createSparkNotifyBuiltinToolsPlugin(): SparkNotifyPlugin {
  return {
    name: 'spark-notify-builtins',
    async prepare(turn) {
      const commands: SparkNotifyCommandDraft[] = []
      const events: SparkNotifyRuntimeEvent[] = []
      let noResponse = false

      const { tools } = await createSparkNotifyTools({
        onCommands: drafts => commands.push(...drafts),
        onEvent: event => events.push(event),
        onNoResponse: () => {
          noResponse = true
        },
        allowNoResponse: turn.policy.allowNoResponse,
        allowSparkCommand: turn.policy.allowSparkCommand,
      })

      return {
        tools,
        getResult: () => ({ commands, noResponse }),
        getPendingEvents: () => events.splice(0),
      }
    },
  }
}
