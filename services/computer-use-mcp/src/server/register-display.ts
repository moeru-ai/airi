import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ComputerUseServerRuntime } from './runtime'

import { z } from 'zod'

import { enumerateDisplays, findDisplayForPoint, formatDisplaySummary } from '../display'
import { errorMessageFromValue } from '../utils/error-message'
import { textContent } from './content'

export interface RegisterDisplayToolsOptions {
  runtime: ComputerUseServerRuntime
  server: McpServer
}

export function registerDisplayTools({ runtime, server }: RegisterDisplayToolsOptions) {
  server.tool(
    'display_enumerate',
    {},
    async () => {
      try {
        const snapshot = await enumerateDisplays(runtime.config)
        const summary = formatDisplaySummary(snapshot)

        return {
          content: [
            textContent(summary),
          ],
          structuredContent: {
            capturedAt: snapshot.capturedAt,
            combinedBounds: snapshot.combinedBounds,
            displayCount: snapshot.displays.length,
            displays: snapshot.displays.map(d => ({
              bounds: d.bounds,
              displayId: d.displayId,
              isBuiltIn: d.isBuiltIn,
              isMain: d.isMain,
              pixelHeight: d.pixelHeight,
              pixelWidth: d.pixelWidth,
              scaleFactor: d.scaleFactor,
              visibleBounds: d.visibleBounds,
            })),
            status: 'ok',
          },
        }
      }
      catch (error) {
        return {
          content: [
            textContent(`Display enumeration failed: ${errorMessageFromValue(error)}`),
          ],
          isError: true,
          structuredContent: {
            error: errorMessageFromValue(error),
            status: 'error',
          },
        }
      }
    },
  )

  server.tool(
    'display_identify_point',
    {
      x: z.number().describe('Logical X coordinate in global screen space'),
      y: z.number().describe('Logical Y coordinate in global screen space'),
    },
    async ({ x, y }) => {
      try {
        const snapshot = await enumerateDisplays(runtime.config)
        const display = findDisplayForPoint(snapshot, x, y)

        if (!display) {
          return {
            content: [
              textContent(`Point (${x}, ${y}) is outside all connected displays.`),
            ],
            structuredContent: {
              displays: snapshot.displays.map(d => ({
                bounds: d.bounds,
                displayId: d.displayId,
              })),
              point: { x, y },
              status: 'outside',
            },
          }
        }

        return {
          content: [
            textContent(`Point (${x}, ${y}) is on display #${display.displayId}${display.isMain ? ' (main)' : ''} — ${display.bounds.width}x${display.bounds.height}.`),
          ],
          structuredContent: {
            display: {
              bounds: display.bounds,
              displayId: display.displayId,
              isMain: display.isMain,
              scaleFactor: display.scaleFactor,
            },
            localCoord: {
              x: x - display.bounds.x,
              y: y - display.bounds.y,
            },
            point: { x, y },
            status: 'ok',
          },
        }
      }
      catch (error) {
        return {
          content: [
            textContent(`Display identify failed: ${errorMessageFromValue(error)}`),
          ],
          isError: true,
          structuredContent: {
            error: errorMessageFromValue(error),
            status: 'error',
          },
        }
      }
    },
  )
}
