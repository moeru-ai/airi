import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ComputerUseServerRuntime } from './runtime'

import { z } from 'zod'

import { enumerateDisplays, findDisplayForPoint, formatDisplaySummary } from '../display'
import { textContent } from './content'

export interface RegisterDisplayToolsOptions {
  server: McpServer
  runtime: ComputerUseServerRuntime
}

export function registerDisplayTools({ server, runtime }: RegisterDisplayToolsOptions) {
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
            status: 'ok',
            displayCount: snapshot.displays.length,
            displays: snapshot.displays.map(d => ({
              displayId: d.displayId,
              isMain: d.isMain,
              isBuiltIn: d.isBuiltIn,
              bounds: d.bounds,
              visibleBounds: d.visibleBounds,
              scaleFactor: d.scaleFactor,
              pixelWidth: d.pixelWidth,
              pixelHeight: d.pixelHeight,
            })),
            combinedBounds: snapshot.combinedBounds,
            capturedAt: snapshot.capturedAt,
          },
        }
      }
      catch (error) {
        return {
          isError: true,
          content: [
            textContent(`Display enumeration failed: ${error instanceof Error ? error.message : String(error)}`),
          ],
          structuredContent: {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
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
              status: 'outside',
              point: { x, y },
              displays: snapshot.displays.map(d => ({
                displayId: d.displayId,
                bounds: d.bounds,
              })),
            },
          }
        }

        return {
          content: [
            textContent(`Point (${x}, ${y}) is on display #${display.displayId}${display.isMain ? ' (main)' : ''} — ${display.bounds.width}x${display.bounds.height}.`),
          ],
          structuredContent: {
            status: 'ok',
            point: { x, y },
            display: {
              displayId: display.displayId,
              isMain: display.isMain,
              bounds: display.bounds,
              scaleFactor: display.scaleFactor,
            },
            localCoord: {
              x: x - display.bounds.x,
              y: y - display.bounds.y,
            },
          },
        }
      }
      catch (error) {
        return {
          isError: true,
          content: [
            textContent(`Display identify failed: ${error instanceof Error ? error.message : String(error)}`),
          ],
          structuredContent: {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        }
      }
    },
  )
}
