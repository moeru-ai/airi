import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ComputerUseServerRuntime } from './runtime'

import { errorMessageFrom } from '@moeru/std'
import { z } from 'zod'

import { textContent } from './content'

/** Registers the Wayland desktop allowlist. Both tools request a new frame from AUV. */
export function registerWaylandObservation(server: McpServer, { config, executor }: ComputerUseServerRuntime) {
  const capture = async (label: string, signal: AbortSignal) => {
    const screenshot = await executor.takeScreenshot({ label }, { signal })
    if (screenshot.placeholder || !screenshot.dataBase64 || !screenshot.width || !screenshot.height)
      throw new Error('AUV did not return a usable display PNG.')

    return {
      data: screenshot.dataBase64,
      frame: {
        width: screenshot.width,
        height: screenshot.height,
        capturedAt: screenshot.capturedAt,
        displayId: screenshot.sourceDisplayId,
      },
    }
  }

  server.registerTool('computer_observe', {
    description: 'Capture the Wayland display through AUV. This backend does not send desktop input.',
  }, async ({ signal }): Promise<CallToolResult> => {
    const observationSignal = AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)])
    try {
      const { data, frame } = await capture('computer_observe', observationSignal)
      const metadata = await executor.observeWindows({ limit: 12 }, { signal: observationSignal }).then(
        observation => ({ windows: observation.windows, foregroundApp: observation.frontmostAppName }),
        (error: unknown) => ({ windowMetadataUnavailable: errorMessageFrom(error) ?? 'AUV could not read window metadata.' }),
      )
      signal.throwIfAborted()
      return {
        content: [textContent(`AUV captured a ${frame.width}x${frame.height} Wayland frame.`), { type: 'image', data, mimeType: 'image/png' }],
        structuredContent: { status: 'ok', backend: 'auv-wayland', frame, ...metadata },
      }
    }
    catch (error) {
      return { isError: true, content: [textContent(`Wayland observation failed: ${errorMessageFrom(error) ?? 'Unknown error'}`)] }
    }
  })

  server.registerTool('computer_verify', {
    description: 'Verify that AUV can capture a fresh Wayland display frame.',
    inputSchema: { check: z.literal('screenshot_ready') },
  }, async ({ check }, { signal }): Promise<CallToolResult> => {
    try {
      const { frame } = await capture('computer_verify', AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]))
      return {
        content: [textContent('computer_verify: verified')],
        structuredContent: { status: 'verified', check, observed: { available: true, ...frame } },
      }
    }
    catch (error) {
      return {
        content: [textContent(`Wayland capture failed: ${errorMessageFrom(error) ?? 'Unknown error'}`)],
        structuredContent: { status: 'not_verified', check, observed: { available: false } },
      }
    }
  })
}
