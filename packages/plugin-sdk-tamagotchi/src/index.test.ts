import type { ContextInit } from '@proj-airi/plugin-sdk'

import type { TamagotchiToolContext } from './index'

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
    const openGamelet = vi.fn()
    const configureGamelet = vi.fn()
    const closeGamelet = vi.fn()
    const isGameletOpen = vi.fn(() => true)

    const ctx: Pick<ContextInit, 'apis'> & TamagotchiToolContext = {
      apis: {
        gamelets: {
          open: openGamelet,
          configure: configureGamelet,
          close: closeGamelet,
          isOpen: isGameletOpen,
        },
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
          withdraw: registerBinding,
        },
        providers: {
          listProviders: async () => [],
        },
      },
    }

    const gamelet = await defineGamelet(ctx, {
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

    await defineToolset(ctx, {
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

    await registerTool.mock.calls[0]?.[0].execute({})

    expect(openGamelet).not.toHaveBeenCalled()
    expect(configureGamelet).not.toHaveBeenCalled()
    expect(closeGamelet).not.toHaveBeenCalled()
    expect(isGameletOpen).not.toHaveBeenCalled()
  })

  /**
   * @example
   * expect(openGamelet).toHaveBeenCalledWith('chess', { opening: 'sicilian' })
   * expect(configureGamelet).toHaveBeenCalledWith('chess', { side: 'black' })
   */
  it('passes host-backed gamelet operations through defineToolset execution context', async () => {
    const registerTool = vi.fn()
    const openGamelet = vi.fn()
    const configureGamelet = vi.fn()
    const closeGamelet = vi.fn()
    const isGameletOpen = vi.fn(() => true)

    const ctx: TamagotchiToolContext = {
      apis: {
        gamelets: {
          open: openGamelet,
          configure: configureGamelet,
          close: closeGamelet,
          isOpen: isGameletOpen,
        },
        tools: {
          register: registerTool,
        },
      },
    }

    await defineToolset(ctx, {
      tools: [
        {
          id: 'drive_chess',
          title: 'Drive Chess',
          description: 'Drive a host-backed chess gamelet.',
          inputSchema: object({}),
          async isAvailable(context) {
            return await context.gamelets.isOpen('chess')
          },
          async execute(_input, context) {
            await context.gamelets.open('chess', { opening: 'sicilian' })
            await context.gamelets.configure('chess', { side: 'black' })
            await context.gamelets.close('chess')

            return { ok: true }
          },
        },
      ],
    })

    const registration = registerTool.mock.calls[0]?.[0]
    expect(registration).toBeDefined()
    await expect(registration?.availability?.()).resolves.toBe(true)
    await expect(registration?.execute({})).resolves.toEqual({ ok: true })

    expect(isGameletOpen).toHaveBeenCalledWith('chess')
    expect(openGamelet).toHaveBeenCalledWith('chess', { opening: 'sicilian' })
    expect(configureGamelet).toHaveBeenCalledWith('chess', { side: 'black' })
    expect(closeGamelet).toHaveBeenCalledWith('chess')
  })

  /**
   * @example
   * await expect(defineToolset({ apis: { tools: { register: registerTool } } } as never, options)).rejects.toThrow(/gamelet API/i)
   */
  it('fails with a clear error when the tamagotchi gamelet API is not available', async () => {
    const registerTool = vi.fn()

    await expect(defineToolset({
      apis: {
        tools: {
          register: registerTool,
        },
      },
    } as never, {
      tools: [
        {
          id: 'drive_chess',
          title: 'Drive Chess',
          description: 'Drive a host-backed chess gamelet.',
          inputSchema: object({}),
          async execute() {
            return { ok: true }
          },
        },
      ],
    })).rejects.toThrow(/gamelet API/i)

    expect(registerTool).not.toHaveBeenCalled()
  })
})
