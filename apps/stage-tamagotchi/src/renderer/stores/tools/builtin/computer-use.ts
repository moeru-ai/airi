import type { Tool, ToolExecuteOptions } from '@xsai/shared-chat'

import type { InvocationAttributionPayload } from '../../../../shared/eventa/computer-use'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'
import { rawTool } from '@xsai/tool'

import {
  computerUseCancel,
  ComputerUseExecutionError,
  computerUseReadImage,
  computerUseRun,
  extractErrorDetails,
} from '../../../../shared/eventa/computer-use'

/** Application-owned execution options. Model arguments cannot supply approval IDs or correlation. */
export interface ComputerUseToolExecuteOptions extends ToolExecuteOptions {
  attribution?: InvocationAttributionPayload
  actionId?: string
}

export interface ComputerUseToolsOptions {
  context?: ReturnType<typeof createContext>['context']
  ipcRenderer?: Parameters<typeof createContext>[0]
}

/** The name of the tool that runs AUV commands. The chat shows its result as a command card. */
export const COMPUTER_USE_TOOL_NAME = 'computer_use'

/** The name of the tool that reads a screenshot. The chat shows its result as the image. */
export const COMPUTER_USE_READ_IMAGE_TOOL_NAME = 'computer_use_read_image'

/** Creates desktop-only tools. IPC clients are local to the elected renderer executor. */
export async function computerUseTools(options?: ComputerUseToolsOptions): Promise<Tool[]> {
  let invokers: ReturnType<typeof createInvokers> | undefined
  const cancellations = new WeakMap<AbortSignal, Set<string>>()
  function createInvokers() {
    const context = options?.context ?? createContext(options?.ipcRenderer ?? window.electron.ipcRenderer).context
    return {
      run: defineInvoke(context, computerUseRun),
      readImage: defineInvoke(context, computerUseReadImage),
      cancel: defineInvoke(context, computerUseCancel),
    }
  }
  function client() {
    invokers ??= createInvokers()
    return invokers
  }

  async function bindCancellation(execution: ComputerUseToolExecuteOptions) {
    const attribution = execution.attribution
    const signal = execution.abortSignal
    if (signal && attribution?.turnId) {
      const request = { ...attribution }
      const cancel = () => client().cancel({ attribution: request, reason: 'Turn was aborted' })
      if (signal.aborted) {
        await cancel()
        throw new ComputerUseExecutionError(errorMessageFrom(signal.reason) ?? 'This operation was aborted', {
          executionState: 'not_executed',
          cause: signal.reason,
        })
      }
      let registered = cancellations.get(signal)
      if (!registered) {
        registered = new Set()
        cancellations.set(signal, registered)
      }
      const key = JSON.stringify([request.sessionId, request.turnId])
      if (!registered.has(key)) {
        registered.add(key)
        // Keep this listener for the request lifetime, including gaps between tools. The WeakMap does not retain the signal.
        signal.addEventListener('abort', () => {
          // A closed renderer loses IPC. Main independently invalidates its approvals on destruction.
          void cancel().catch(() => {})
        }, { once: true })
      }
    }
    if (signal?.aborted) {
      const rawMessage = errorMessageFrom(signal.reason) ?? 'This operation was aborted'
      throw new ComputerUseExecutionError(`[executionState: not_executed] ${rawMessage}`, {
        executionState: 'not_executed',
        rawMessage,
        cause: signal.reason,
      })
    }
    return attribution
  }
  return [
    rawTool({
      name: COMPUTER_USE_TOOL_NAME,
      description: 'Inspect local desktop windows and capture screenshots. Desktop mutations require a matching host approval. Keyboard and pointer input are currently disabled. On macOS, call app.probePermissions before visual tasks. If screen_recording is missing, ask the user to grant permission. Captures can contain only a blank background without that permission. Start with argv ["invoke", "--help"], then inspect command help. Pass each CLI argument separately. Preserve failure_details and verified metadata. Exit code 0 does not prove the intended application effect. Use computer_use_read_image to view screenshot artifact paths.',
      parameters: {
        type: 'object',
        properties: {
          argv: { type: 'array', items: { type: 'string' }, description: 'AUV arguments beginning with invoke, excluding the executable name.' },
        },
        required: ['argv'],
        additionalProperties: false,
      },
      execute: async (input, executeOptions) => {
        const execution = executeOptions as ComputerUseToolExecuteOptions
        const attribution = await bindCancellation(execution)
        const rawInput = input as { argv: string[] }
        try {
          const result = await client().run(
            { argv: rawInput.argv, actionId: execution.actionId, attribution },
            { signal: execution.abortSignal },
          )
          if (result.exitCode !== 0) {
            const rawMessage = JSON.stringify(result)
            throw new ComputerUseExecutionError(`[executionState: ${result.executionState ?? 'executed'}] ${rawMessage}`, {
              executionState: result.executionState ?? 'executed',
              rawMessage,
              argv: result.argv,
              exitCode: result.exitCode,
              stderr: result.stderr,
            })
          }
          return JSON.stringify(result)
        }
        catch (error) {
          const details = extractErrorDetails(error)
          let executionState = details.executionState
          if (executionState === 'not_executed' && execution.abortSignal?.aborted) {
            // Cancellation happened after dispatch was in-flight. Side effects are unknown.
            executionState = 'unknown'
          }
          const rawMessage = details.rawMessage ?? errorMessageFrom(error) ?? 'Computer use execution failed.'
          const formattedMessage = rawMessage.includes('[executionState:')
            ? rawMessage
            : `[executionState: ${executionState}] ${rawMessage}`
          throw new ComputerUseExecutionError(formattedMessage, {
            ...details,
            executionState,
            rawMessage,
            argv: details.argv ?? rawInput.argv,
            cause: error,
          })
        }
      },
    }),
    rawTool({
      name: COMPUTER_USE_READ_IMAGE_TOOL_NAME,
      description: 'View a PNG, JPEG, or WebP screenshot artifact produced by computer_use. Only files inside AIRI computer-use storage can be read. Select this tool together with computer_use for visual tasks.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute screenshot artifact path returned by computer_use.' } },
        required: ['path'],
        additionalProperties: false,
      },
      execute: async (input, executeOptions) => {
        const execution = executeOptions as ComputerUseToolExecuteOptions
        const attribution = await bindCancellation(execution)
        const rawInput = input as { path: string }

        return [{
          type: 'image_url',
          image_url: {
            url: await client().readImage({
              path: rawInput.path,
              attribution,
            }, { signal: execution.abortSignal }),
          },
        }]
      },
    }),
  ]
}
