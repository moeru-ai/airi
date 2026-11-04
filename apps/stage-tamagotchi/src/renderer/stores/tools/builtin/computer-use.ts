import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { rawTool } from '@xsai/tool'

import type { InvocationAttributionPayload } from '../../../../shared/eventa/computer-use'
import { computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'

export interface ComputerUseToolExecuteOptions {
  toolCallId?: string
  attribution?: InvocationAttributionPayload
}

export interface ComputerUseToolsOptions {
  getAttribution?: () => InvocationAttributionPayload | undefined
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
  function createInvokers() {
    const context = options?.context ?? createContext(options?.ipcRenderer ?? window.electron.ipcRenderer).context
    return {
      run: defineInvoke(context, computerUseRun),
      readImage: defineInvoke(context, computerUseReadImage),
    }
  }
  function client() {
    invokers ??= createInvokers()
    return invokers
  }
  return [
    rawTool({
      name: COMPUTER_USE_TOOL_NAME,
      description: 'Control native desktop apps, inspect windows, capture screenshots, and use keyboard or mouse input. On macOS, call app.probePermissions before visual tasks. If screen_recording is missing, ask the user to grant permission; captures can contain only a blank background. Start with argv ["invoke", "--help"], then inspect command help. Pass each CLI argument separately. Use explicit window targets when available. Preserve failure_details and verified metadata: exitCode 0 does not prove the intended UI effect. Use computer_use_read_image to view screenshot artifact paths. This tool acts on the local computer.',
      parameters: {
        type: 'object',
        properties: {
          argv: { type: 'array', items: { type: 'string' }, description: 'AUV arguments beginning with invoke, excluding the executable name.' },
          actionId: { type: 'string', description: 'Approved action ID for executing mutating operations.' },
        },
        required: ['argv'],
        additionalProperties: false,
      },
      execute: async (input, executeOptions) => {
        const candidate = executeOptions as ComputerUseToolExecuteOptions | undefined
        const attribution = candidate?.attribution ?? options?.getAttribution?.()
        const rawInput = input as { argv: string[], actionId?: string }
        const result = await client().run({
          argv: rawInput.argv,
          actionId: rawInput.actionId,
          attribution,
        })
        if (result.exitCode !== 0)
          throw new Error(JSON.stringify(result))
        return JSON.stringify(result)
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
        const candidate = executeOptions as ComputerUseToolExecuteOptions | undefined
        const attribution = candidate?.attribution ?? options?.getAttribution?.()
        const rawInput = input as { path: string }
        return [{
          type: 'image_url',
          image_url: {
            url: await client().readImage({
              path: rawInput.path,
              attribution,
            }),
          },
        }]
      },
    }),
  ]
}
