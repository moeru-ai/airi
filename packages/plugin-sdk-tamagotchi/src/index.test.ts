import { object, optional, string } from 'valibot'
import { describe, expect, it, vi } from 'vitest'

import { defineGamelet, defineToolset } from './index'

describe('plugin-sdk-tamagotchi', () => {
  /**
   * @example
   * expect(registerBinding).toHaveBeenCalledWith(expect.objectContaining({ kitId: 'kit.gamelet' }))
   * expect(registerTool).toHaveBeenCalledWith(expect.objectContaining({ tool: expect.any(Object) }))
   */
  it('should allow a plugin to define a gamelet and toolset without raw kit or module calls', async () => {
    const registerBinding = vi.fn()
    const registerTool = vi.fn()

    const ctx = {
      apis: {
        tools: {
          register: registerTool,
        },
        kits: {
          list: async () => [
            {
              kitId: 'kit.gamelet',
              version: '1.0.0',
              runtimes: ['electron'],
              capabilities: [],
            },
          ],
          getCapabilities: async () => [
            {
              key: 'kit.gamelet.runtime',
              actions: ['announce', 'activate', 'update'],
            },
          ],
        },
        bindings: {
          list: async () => [],
          announce: registerBinding,
          update: registerBinding,
          activate: registerBinding,
        },
      },
    }

    const gamelet = await defineGamelet(ctx as never, {
      id: 'chess',
      title: 'Chess',
      entrypoint: './ui/index.html',
      widgets: [
        {
          id: 'main-board',
          kind: 'primary',
        },
      ],
    })

    await defineToolset(ctx as never, {
      tools: [
        {
          id: 'play_chess',
          title: 'Play Chess',
          description: 'Open chess.',
          inputSchema: object({
            opening: optional(string()),
          }),
          execute: async () => ({ ok: true }),
        },
      ],
    })

    expect(gamelet).toBeDefined()
    expect(registerBinding).toHaveBeenCalledWith({
      moduleId: 'chess',
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      config: {
        title: 'Chess',
        entrypoint: './ui/index.html',
        widgets: [
          {
            id: 'main-board',
            kind: 'primary',
          },
        ],
        widget: {
          mount: 'iframe',
          iframe: {
            assetPath: './ui/index.html',
            sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
          },
          windowSize: {
            width: 980,
            height: 840,
            minWidth: 640,
            minHeight: 640,
          },
        },
      },
    })
    expect(registerBinding).toHaveBeenCalledWith({
      moduleId: 'chess',
    })
    expect(registerTool).toHaveBeenCalled()
    expect(registerTool).toHaveBeenCalledWith(expect.objectContaining({
      tool: expect.objectContaining({
        id: 'play_chess',
        parameters: expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            opening: expect.objectContaining({
              type: 'string',
            }),
          }),
        }),
      }),
    }))
  })
})
