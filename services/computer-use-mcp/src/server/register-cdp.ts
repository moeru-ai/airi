import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ComputerUseServerRuntime } from './runtime'

import { z } from 'zod'

import { errorMessageFromValue } from '../utils/error-message'
import { textContent } from './content'

export interface RegisterCdpToolsOptions {
  runtime: ComputerUseServerRuntime
  server: McpServer
}

/**
 * Register CDP-based browser tools that connect directly to Chrome
 * via the DevTools Protocol, without requiring the browser extension.
 */
export function registerCdpTools({ runtime, server }: RegisterCdpToolsOptions) {
  server.tool(
    'browser_cdp_connect',
    {
      cdpUrl: z.string().optional().describe('Chrome DevTools Protocol endpoint (default: http://localhost:9222)'),
    },
    async ({ cdpUrl }) => {
      try {
        const bridge = await runtime.cdpBridgeManager.ensureBridge(cdpUrl)
        const status = bridge.getStatus()

        return {
          content: [
            textContent(`CDP connected to ${status.pageTitle} (${status.pageUrl}).`),
          ],
          structuredContent: {
            cdp: status,
            status: 'ok',
          },
        }
      }
      catch (error) {
        return {
          content: [
            textContent(`CDP connect failed: ${errorMessageFromValue(error)}. Ensure Chrome is running with --remote-debugging-port=9222.`),
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
    'browser_cdp_status',
    {},
    async () => {
      const status = runtime.cdpBridgeManager.getStatus()

      return {
        content: [
          textContent(`CDP bridge: ${status.connected ? `connected to ${status.pageTitle}` : 'disconnected'}.`),
        ],
        structuredContent: {
          cdp: status,
          status: 'ok',
        },
      }
    },
  )

  server.tool(
    'browser_cdp_accessibility_snapshot',
    {
      cdpUrl: z.string().optional().describe('CDP endpoint override'),
    },
    async ({ cdpUrl }) => {
      try {
        const bridge = await runtime.cdpBridgeManager.ensureBridge(cdpUrl)
        const snapshot = await bridge.getAccessibilityTree()
        const text = bridge.formatAXTreeAsText(snapshot)

        return {
          content: [textContent(text)],
          structuredContent: {
            capturedAt: snapshot.capturedAt,
            nodeCount: snapshot.nodes.length,
            pageTitle: snapshot.pageTitle,
            pageUrl: snapshot.pageUrl,
            status: 'ok',
          },
        }
      }
      catch (error) {
        return {
          content: [
            textContent(`CDP accessibility snapshot failed: ${errorMessageFromValue(error)}`),
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
    'browser_cdp_evaluate',
    {
      cdpUrl: z.string().optional().describe('CDP endpoint override'),
      expression: z.string().min(1).describe('JavaScript expression to evaluate in the page context'),
    },
    async ({ cdpUrl, expression }) => {
      try {
        const bridge = await runtime.cdpBridgeManager.ensureBridge(cdpUrl)
        const result = await bridge.evaluate(expression)

        return {
          content: [textContent(typeof result === 'string' ? result : JSON.stringify(result, null, 2))],
          structuredContent: {
            result,
            status: 'ok',
          },
        }
      }
      catch (error) {
        return {
          content: [
            textContent(`CDP evaluate failed: ${errorMessageFromValue(error)}`),
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
    'browser_cdp_collect_elements',
    {
      cdpUrl: z.string().optional().describe('CDP endpoint override'),
      maxElements: z.number().int().min(1).max(500).optional().describe('Maximum interactive elements to collect (default: 200)'),
    },
    async ({ cdpUrl, maxElements }) => {
      try {
        const bridge = await runtime.cdpBridgeManager.ensureBridge(cdpUrl)
        const elements = await bridge.collectInteractiveElements(maxElements)

        return {
          content: [
            textContent(`Collected ${elements.length} interactive element(s) from ${bridge.getStatus().pageTitle}.`),
          ],
          structuredContent: {
            elementCount: elements.length,
            elements,
            page: {
              title: bridge.getStatus().pageTitle,
              url: bridge.getStatus().pageUrl,
            },
            status: 'ok',
          },
        }
      }
      catch (error) {
        return {
          content: [
            textContent(`CDP collect elements failed: ${errorMessageFromValue(error)}`),
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
    'browser_cdp_screenshot',
    {
      cdpUrl: z.string().optional().describe('CDP endpoint override'),
      format: z.enum(['png', 'jpeg']).optional().describe('Image format (default: png)'),
      quality: z.number().int().min(0).max(100).optional().describe('JPEG quality (only for jpeg format)'),
    },
    async ({ cdpUrl, format, quality }) => {
      try {
        const bridge = await runtime.cdpBridgeManager.ensureBridge(cdpUrl)
        const base64 = await bridge.screenshot({ format, quality })

        return {
          content: [
            {
              data: base64,
              mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
              type: 'image' as const,
            },
          ],
          structuredContent: {
            format: format ?? 'png',
            page: {
              title: bridge.getStatus().pageTitle,
              url: bridge.getStatus().pageUrl,
            },
            status: 'ok',
          },
        }
      }
      catch (error) {
        return {
          content: [
            textContent(`CDP screenshot failed: ${errorMessageFromValue(error)}`),
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
    'browser_cdp_navigate',
    {
      cdpUrl: z.string().optional().describe('CDP endpoint override'),
      url: z.string().min(1).describe('URL to navigate to'),
    },
    async ({ cdpUrl, url }) => {
      try {
        const bridge = await runtime.cdpBridgeManager.ensureBridge(cdpUrl)
        await bridge.navigate(url)

        return {
          content: [textContent(`Navigated to ${url}.`)],
          structuredContent: {
            status: 'ok',
            url,
          },
        }
      }
      catch (error) {
        return {
          content: [
            textContent(`CDP navigate failed: ${errorMessageFromValue(error)}`),
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

  // Return a cleanup function for server shutdown
  return {
    async close() {
      await runtime.cdpBridgeManager.close()
    },
  }
}
