import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ComputerUseServerRuntime } from './runtime'

import { z } from 'zod'

import { textContent } from './content'

export interface RegisterCdpToolsOptions {
  server: McpServer
  runtime: ComputerUseServerRuntime
}

/**
 * Register CDP-based browser tools that connect directly to Chrome
 * via the DevTools Protocol, without requiring the browser extension.
 */
export function registerCdpTools({ server, runtime }: RegisterCdpToolsOptions) {
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
            status: 'ok',
            cdp: status,
          },
        }
      }
      catch (error) {
        return {
          isError: true,
          content: [
            textContent(`CDP connect failed: ${error instanceof Error ? error.message : String(error)}. Ensure Chrome is running with --remote-debugging-port=9222.`),
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
    'browser_cdp_status',
    {},
    async () => {
      const status = runtime.cdpBridgeManager.getStatus()

      return {
        content: [
          textContent(`CDP bridge: ${status.connected ? `connected to ${status.pageTitle}` : 'disconnected'}.`),
        ],
        structuredContent: {
          status: 'ok',
          cdp: status,
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
            status: 'ok',
            pageUrl: snapshot.pageUrl,
            pageTitle: snapshot.pageTitle,
            nodeCount: snapshot.nodes.length,
            capturedAt: snapshot.capturedAt,
          },
        }
      }
      catch (error) {
        return {
          isError: true,
          content: [
            textContent(`CDP accessibility snapshot failed: ${error instanceof Error ? error.message : String(error)}`),
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
    'browser_cdp_evaluate',
    {
      expression: z.string().min(1).describe('JavaScript expression to evaluate in the page context'),
      cdpUrl: z.string().optional().describe('CDP endpoint override'),
    },
    async ({ expression, cdpUrl }) => {
      try {
        const bridge = await runtime.cdpBridgeManager.ensureBridge(cdpUrl)
        const result = await bridge.evaluate(expression)

        return {
          content: [textContent(typeof result === 'string' ? result : JSON.stringify(result, null, 2))],
          structuredContent: {
            status: 'ok',
            result,
          },
        }
      }
      catch (error) {
        return {
          isError: true,
          content: [
            textContent(`CDP evaluate failed: ${error instanceof Error ? error.message : String(error)}`),
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
    'browser_cdp_collect_elements',
    {
      maxElements: z.number().int().min(1).max(500).optional().describe('Maximum interactive elements to collect (default: 200)'),
      cdpUrl: z.string().optional().describe('CDP endpoint override'),
    },
    async ({ maxElements, cdpUrl }) => {
      try {
        const bridge = await runtime.cdpBridgeManager.ensureBridge(cdpUrl)
        const elements = await bridge.collectInteractiveElements(maxElements)

        return {
          content: [
            textContent(`Collected ${elements.length} interactive element(s) from ${bridge.getStatus().pageTitle}.`),
          ],
          structuredContent: {
            status: 'ok',
            elementCount: elements.length,
            elements,
            page: {
              url: bridge.getStatus().pageUrl,
              title: bridge.getStatus().pageTitle,
            },
          },
        }
      }
      catch (error) {
        return {
          isError: true,
          content: [
            textContent(`CDP collect elements failed: ${error instanceof Error ? error.message : String(error)}`),
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
    'browser_cdp_screenshot',
    {
      format: z.enum(['png', 'jpeg']).optional().describe('Image format (default: png)'),
      quality: z.number().int().min(0).max(100).optional().describe('JPEG quality (only for jpeg format)'),
      cdpUrl: z.string().optional().describe('CDP endpoint override'),
    },
    async ({ format, quality, cdpUrl }) => {
      try {
        const bridge = await runtime.cdpBridgeManager.ensureBridge(cdpUrl)
        const base64 = await bridge.screenshot({ format, quality })

        return {
          content: [
            {
              type: 'image' as const,
              data: base64,
              mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
            },
          ],
          structuredContent: {
            status: 'ok',
            format: format ?? 'png',
            page: {
              url: bridge.getStatus().pageUrl,
              title: bridge.getStatus().pageTitle,
            },
          },
        }
      }
      catch (error) {
        return {
          isError: true,
          content: [
            textContent(`CDP screenshot failed: ${error instanceof Error ? error.message : String(error)}`),
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
    'browser_cdp_navigate',
    {
      url: z.string().min(1).describe('URL to navigate to'),
      cdpUrl: z.string().optional().describe('CDP endpoint override'),
    },
    async ({ url, cdpUrl }) => {
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
          isError: true,
          content: [
            textContent(`CDP navigate failed: ${error instanceof Error ? error.message : String(error)}`),
          ],
          structuredContent: {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
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
