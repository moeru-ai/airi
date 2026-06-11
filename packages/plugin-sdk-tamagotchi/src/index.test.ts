import type { ContextInit } from '@proj-airi/plugin-sdk'

import { object, optional, string } from 'valibot'
import { describe, expect, it, vi } from 'vitest'

import { defineGamelet, gameletKit, toolKit } from './index'

describe('plugin-sdk-tamagotchi', () => {
  it('exposes gameletKit as a module-scoped kit client', async () => {
    const bindings: unknown[] = []
    const client = gameletKit.createClient({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      moduleId: 'chess',
      bindings: {
        bind: async (input: unknown) => {
          bindings.push(input)
          return { moduleId: 'chess:gamelet', state: 'active' }
        },
      },
    } as never)

    await client.mount({
      title: 'Chess',
      ui: client.iframe({ assetPath: 'ui/index.html' }),
      defaults: { airiSide: 'black' },
    })

    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      moduleId: 'chess:gamelet',
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
    })
  })

  /**
   * @example
   * expect(bindings[0]).toMatchObject({ moduleId: 'session-1:gamelet' })
   */
  it('derives a stable gameletKit binding id for extension-scoped clients', async () => {
    const bindings: unknown[] = []
    const client = gameletKit.createClient({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      bindings: {
        bind: async (input: unknown) => {
          bindings.push(input)
          return { moduleId: 'session-1:gamelet', state: 'active' }
        },
      },
    } as never)

    await client.mount({
      title: 'Chess',
      ui: client.iframe({ assetPath: 'ui/index.html' }),
    })

    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      moduleId: 'session-1:gamelet',
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
    })
  })

  /**
   * @example
   * expect(registerTool).toHaveBeenCalledWith(expect.objectContaining({ tool: expect.objectContaining({ id: 'play_chess' }) }))
   * expect(registerPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'chess-tools' }))
   */
  it('exposes toolKit as a module-scoped kit client without a gamelet runtime', async () => {
    const registerTool = vi.fn()
    const registerPrompt = vi.fn()

    const client = toolKit.createClient({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      moduleId: 'chess',
      tools: {
        register: registerTool,
        registerToolsetPrompt: registerPrompt,
      },
    } as never)

    await client.registerToolsetPrompt({
      id: 'chess-toolset',
      prompt: {
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
        content: 'Do not pass fen or pgn when mode is "new".',
      },
    })
    await client.registerTool({
      id: 'play_chess',
      title: 'Play Chess',
      description: 'Open chess.',
      inputSchema: object({}),
      execute: async () => ({ ok: true }),
    })

    expect(registerPrompt).toHaveBeenCalledWith({
      id: 'chess-toolset',
      prompt: {
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
        content: 'Do not pass fen or pgn when mode is "new".',
      },
    })
    expect(registerTool).toHaveBeenCalledWith(expect.objectContaining({
      tool: expect.objectContaining({
        id: 'play_chess',
      }),
    }))

    await expect(registerTool.mock.calls[0]?.[0].execute({})).resolves.toEqual({ ok: true })
  })

  /**
   * @example
   * expect(registerBinding).toHaveBeenCalledWith(expect.objectContaining({ kitId: 'kit.gamelet' }))
   * expect(registerTool).toHaveBeenCalledWith(expect.objectContaining({ tool: expect.any(Object) }))
   */
  it('allows gamelet and tool kits to be composed without coupling tool registration to gamelets', async () => {
    const registerBinding = vi.fn()
    const registerTool = vi.fn()
    const openGamelet = vi.fn<(id: string, params?: Record<string, unknown>) => Promise<void>>()
    const configureGamelet = vi.fn<(id: string, patch: Record<string, unknown>) => Promise<void>>()
    const closeGamelet = vi.fn<(id: string) => Promise<void>>()
    const isGameletOpen = vi.fn<(id: string) => boolean>(() => true)

    const ctx: Pick<ContextInit, 'apis'> = {
      apis: {
        tools: {
          register: registerTool,
          registerToolsetPrompt: vi.fn(),
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
    const gamelets = {
      open: openGamelet,
      configure: configureGamelet,
      request: vi.fn(async () => ({})),
      close: closeGamelet,
      isOpen: isGameletOpen,
    }
    const tools = toolKit.createClient({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      moduleId: 'chess',
      tools: ctx.apis.tools,
    } as never)

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

    await tools.registerToolsetPrompt({
      id: 'chess-tools',
      prompt: {
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
        content: 'Do not pass fen or pgn when mode is "new".',
      },
    })
    await tools.registerTool({
      id: 'play_chess',
      title: 'Play Chess',
      description: 'Open chess.',
      inputSchema: object({
        opening: optional(string()),
      }),
      async execute() {
        await gamelets.open('chess')
        return { ok: true }
      },
    })

    expect(ctx.apis.tools.registerToolsetPrompt).toHaveBeenCalledWith({
      id: 'chess-tools',
      prompt: {
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
        content: 'Do not pass fen or pgn when mode is "new".',
      },
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
              type: ['string', 'null'],
            }),
          }),
          required: ['opening'],
        }),
      }),
    }))

    await registerTool.mock.calls[0]?.[0].execute({})

    expect(openGamelet).toHaveBeenCalledWith('chess')
    expect(configureGamelet).not.toHaveBeenCalled()
    expect(closeGamelet).not.toHaveBeenCalled()
    expect(isGameletOpen).not.toHaveBeenCalled()
  })

  /**
   * @example
   * expect(openGamelet).toHaveBeenCalledWith('chess', { opening: 'sicilian' })
   * expect(configureGamelet).toHaveBeenCalledWith('chess', { side: 'black' })
   */
  it('lets extension authors compose gamelet handles inside tool execution closures', async () => {
    const registerTool = vi.fn()
    const openGamelet = vi.fn()
    const configureGamelet = vi.fn()
    const closeGamelet = vi.fn()
    const isGameletOpen = vi.fn<(id: string) => boolean>(() => true)

    const gamelets = {
      open: openGamelet,
      configure: configureGamelet,
      request: vi.fn<(id: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>>(async () => ({ ready: true })),
      close: closeGamelet,
      isOpen: isGameletOpen,
    }
    const tools = toolKit.createClient({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      moduleId: 'chess',
      tools: {
        register: registerTool,
        registerToolsetPrompt: vi.fn(),
      },
    } as never)

    await tools.registerTool({
      id: 'drive_chess',
      title: 'Drive Chess',
      description: 'Drive a host-backed chess gamelet.',
      inputSchema: object({}),
      isAvailable: async () => await gamelets.isOpen('chess'),
      async execute() {
        await gamelets.open('chess', { opening: 'sicilian' })
        await gamelets.configure('chess', { side: 'black' })
        await gamelets.request('chess', { action: 'snapshot' })
        await gamelets.close('chess')

        return { ok: true }
      },
    })

    const registration = registerTool.mock.calls[0]?.[0]
    expect(registration).toBeDefined()
    await expect(registration?.availability?.()).resolves.toBe(true)
    await expect(registration?.execute({})).resolves.toEqual({ ok: true })

    expect(isGameletOpen).toHaveBeenCalledWith('chess')
    expect(registration.availability).toBeTypeOf('function')
    expect(openGamelet).toHaveBeenCalledWith('chess', { opening: 'sicilian' })
    expect(configureGamelet).toHaveBeenCalledWith('chess', { side: 'black' })
    expect(gamelets.request).toHaveBeenCalledWith('chess', { action: 'snapshot' })
    expect(closeGamelet).toHaveBeenCalledWith('chess')
  })

  /**
   * @example
   * expect(tool.parameters.required).toEqual(Object.keys(tool.parameters.properties))
   */
  it('serializes optional tool fields as required nullable properties for strict OpenAI-compatible schemas', async () => {
    const registerTool = vi.fn()
    const tools = toolKit.createClient({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      moduleId: 'chess',
      tools: {
        register: registerTool,
        registerToolsetPrompt: vi.fn(),
      },
    } as never)

    await tools.registerTool({
      id: 'play_chess',
      title: 'Play Chess',
      description: 'Open chess.',
      inputSchema: object({
        mode: string(),
        opening: optional(string()),
      }),
      execute: async () => ({ ok: true }),
    })

    const parameters = registerTool.mock.calls[0]?.[0].tool.parameters

    expect(parameters.required).toEqual(['mode', 'opening'])
    expect(parameters.properties.opening.type).toEqual(['string', 'null'])
  })
})
