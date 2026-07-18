import type {
  ExtensionModuleRef,
  KitAvailability,
  KitClientRuntime,
  KitRef,
  KitUseResult,
} from '@proj-airi/plugin-sdk'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import type { ToolKitRuntime } from './tools'

import { DisposableStore } from '@proj-airi/plugin-sdk'
import { object, optional, string } from 'valibot'
import { describe, expect, it, vi } from 'vitest'

import {
  gameletIframeRequest,
  gameletIframeRequestEventName,
  gameletKit,
  TamagotchiToolRegistry,
  toolKit,
} from './index'
import { createGamelet } from './kits/gamelet'
import { registerTools } from './kits/tool'

type ToolRuntimeServices = NonNullable<ToolKitRuntime['tools']>
type GameletOrchestrationRuntime = NonNullable<ReturnType<typeof gameletKit.createClient>['orchestration']>

function createGameletRuntime(input: {
  extensionId: string
  sessionId: string
  moduleId?: string
  bind: (input: unknown) => Promise<unknown> | unknown
  gamelets?: GameletOrchestrationRuntime
}): KitClientRuntime & {
  bindings: {
    bind: (input: unknown) => Promise<unknown> | unknown
  }
  gamelets?: GameletOrchestrationRuntime
} {
  return {
    extensionId: input.extensionId,
    sessionId: input.sessionId,
    moduleId: input.moduleId,
    subscriptions: new DisposableStore(),
    bindings: {
      bind: input.bind,
    },
    gamelets: input.gamelets,
  }
}

function createToolRuntime(input: {
  extensionId: string
  sessionId: string
  moduleId?: string
  register: ToolRuntimeServices['register']
  registerToolsetPrompt: ToolRuntimeServices['registerToolsetPrompt']
}): ToolKitRuntime {
  return {
    extensionId: input.extensionId,
    sessionId: input.sessionId,
    moduleId: input.moduleId,
    subscriptions: new DisposableStore(),
    tools: {
      register: input.register,
      registerToolsetPrompt: input.registerToolsetPrompt,
    },
  }
}

function createGameletModuleRef(input: {
  id: string
  extensionId: string
  sessionId: string
  bind: (input: unknown) => Promise<unknown> | unknown
  gamelets?: GameletOrchestrationRuntime
}): { module: ExtensionModuleRef, useKit: ReturnType<typeof vi.fn> } {
  const useKit = vi.fn()

  const module: ExtensionModuleRef = {
    id: input.id,
    kits: {
      async use<TClient>(kit: KitRef<TClient>): Promise<TClient> {
        useKit(kit)
        if (kit !== gameletKit) {
          throw new Error(`Unexpected kit requested: ${kit.id}`)
        }

        return gameletKit.createClient(createGameletRuntime({
          extensionId: input.extensionId,
          sessionId: input.sessionId,
          moduleId: input.id,
          bind: input.bind,
          gamelets: input.gamelets,
        })) as TClient
      },
      async tryUse<TClient>(kit: KitRef<TClient>): Promise<KitUseResult<TClient>> {
        return {
          ok: false,
          reason: 'missing-kit',
          error: new Error(`Unused test kit lookup: ${kit.id}`),
        }
      },
      watch<TClient>(
        _kit: KitRef<TClient>,
        _callback: (availability: KitAvailability<TClient>) => void | Promise<void>,
      ) {
        return { dispose: vi.fn() }
      },
    },
    subscriptions: new DisposableStore(),
    dispose: vi.fn(async () => {}),
  }

  return { module, useKit }
}

function createToolModuleRef(input: {
  id: string
  extensionId: string
  sessionId: string
  register: ToolRuntimeServices['register']
  registerToolsetPrompt: ToolRuntimeServices['registerToolsetPrompt']
}): { module: ExtensionModuleRef, useKit: ReturnType<typeof vi.fn> } {
  const useKit = vi.fn()

  const module: ExtensionModuleRef = {
    id: input.id,
    kits: {
      async use<TClient>(kit: KitRef<TClient>): Promise<TClient> {
        useKit(kit)
        if (kit !== toolKit) {
          throw new Error(`Unexpected kit requested: ${kit.id}`)
        }

        return toolKit.createClient(createToolRuntime({
          extensionId: input.extensionId,
          sessionId: input.sessionId,
          moduleId: input.id,
          register: input.register,
          registerToolsetPrompt: input.registerToolsetPrompt,
        })) as TClient
      },
      async tryUse<TClient>(kit: KitRef<TClient>): Promise<KitUseResult<TClient>> {
        return {
          ok: false,
          reason: 'missing-kit',
          error: new Error(`Unused test kit lookup: ${kit.id}`),
        }
      },
      watch<TClient>(
        _kit: KitRef<TClient>,
        _callback: (availability: KitAvailability<TClient>) => void | Promise<void>,
      ) {
        return { dispose: vi.fn() }
      },
    },
    subscriptions: new DisposableStore(),
    dispose: vi.fn(async () => {}),
  }

  return { module, useKit }
}

describe('plugin-sdk-tamagotchi', () => {
  it('exports shared gamelet iframe request contracts', () => {
    expect(gameletIframeRequestEventName).toBe('eventa:invoke:gamelet:iframe:request')
    expect(gameletIframeRequest).toEqual(expect.objectContaining({
      sendEvent: expect.objectContaining({
        id: expect.stringContaining('eventa:invoke:gamelet:iframe:request'),
      }),
    }))
  })

  it('exposes gameletKit as a module-scoped kit client', async () => {
    const bindings: unknown[] = []
    const client = gameletKit.createClient(createGameletRuntime({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      moduleId: 'chess',
      bind: async (input: unknown) => {
        bindings.push(input)
        return { moduleId: 'chess:gamelet', state: 'active' }
      },
    }))

    await client.mount({
      title: 'Chess',
      ui: client.iframe({ assetPath: 'ui/index.html' }),
      init: { airiSide: 'black' },
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
    const client = gameletKit.createClient(createGameletRuntime({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      bind: async (input: unknown) => {
        bindings.push(input)
        return { moduleId: 'session-1:gamelet', state: 'active' }
      },
    }))

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
   * expect(open).toHaveBeenCalledWith('chess:board', { mode: 'new' })
   * expect(isOpen).toHaveBeenCalledWith('chess:board')
   */
  it('routes createGamelet handle orchestration calls through the host gamelet runtime', async () => {
    const open = vi.fn(async (_bindingId: string, _payload?: HostDataRecord) => {})
    const configure = vi.fn(async (_bindingId: string, _payload: HostDataRecord) => {})
    const requestCalls: [string, HostDataRecord, { timeoutMs?: number } | undefined][] = []
    const request: GameletOrchestrationRuntime['request'] = async <TResponse = HostDataRecord>(
      bindingId: string,
      payload: HostDataRecord,
      options?: { timeoutMs?: number },
    ): Promise<TResponse> => {
      requestCalls.push([bindingId, payload, options])
      return { ok: true } as TResponse
    }
    const close = vi.fn(async (_bindingId: string) => {})
    const isOpen = vi.fn(async (_bindingId: string) => true)
    const { module } = createGameletModuleRef({
      id: 'chess',
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      bind: async () => ({ moduleId: 'chess:board', state: 'active' }),
      gamelets: {
        open,
        configure,
        request,
        close,
        isOpen,
      },
    })

    const handle = await createGamelet(module, {
      id: 'board',
      title: 'Chess Board',
      indexPath: 'ui/index.html',
    })

    await handle.open({ mode: 'new' })
    await handle.configure({ airiSide: 'black' })
    await handle.request({ action: 'snapshot' })
    await handle.close()
    await expect(handle.isOpen()).resolves.toBe(true)

    expect(open).toHaveBeenCalledWith('chess:board', { mode: 'new' })
    expect(configure).toHaveBeenCalledWith('chess:board', { airiSide: 'black' })
    expect(requestCalls).toEqual([['chess:board', { action: 'snapshot' }, undefined]])
    expect(close).toHaveBeenCalledWith('chess:board')
    expect(isOpen).toHaveBeenCalledWith('chess:board')
  })

  /**
   * @example
   * await expect(handle.open()).rejects.toThrow('gameletKit requires a host gamelet orchestration runtime.')
   */
  it('reports a clear error when createGamelet orchestration methods run without a host runtime', async () => {
    const { module } = createGameletModuleRef({
      id: 'chess',
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      bind: async () => ({ moduleId: 'chess:board', state: 'active' }),
    })

    const handle = await createGamelet(module, {
      id: 'board',
      title: 'Chess Board',
      indexPath: 'ui/index.html',
    })

    await expect(handle.open()).rejects.toThrow('gameletKit requires a host gamelet orchestration runtime.')
    await expect(handle.configure({ airiSide: 'black' })).rejects.toThrow('gameletKit requires a host gamelet orchestration runtime.')
    await expect(handle.request({ action: 'snapshot' })).rejects.toThrow('gameletKit requires a host gamelet orchestration runtime.')
    await expect(handle.close()).rejects.toThrow('gameletKit requires a host gamelet orchestration runtime.')
    await expect(handle.isOpen()).rejects.toThrow('gameletKit requires a host gamelet orchestration runtime.')
    await expect(module.subscriptions.dispose()).resolves.toBeUndefined()
  })

  /**
   * @example
   * await module.subscriptions.dispose()
   * expect(close).toHaveBeenCalledWith('chess:board')
   */
  it('registers gamelet close cleanup with the module subscription scope', async () => {
    const close = vi.fn(async (_bindingId: string) => {})
    const { module } = createGameletModuleRef({
      id: 'chess',
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      bind: async () => ({ moduleId: 'chess:board', state: 'active' }),
      gamelets: {
        open: vi.fn(),
        configure: vi.fn(),
        request: vi.fn(),
        close,
        isOpen: vi.fn(),
      },
    })

    await createGamelet(module, {
      id: 'board',
      title: 'Chess Board',
      indexPath: 'ui/index.html',
    })
    await module.subscriptions.dispose()

    expect(close).toHaveBeenCalledWith('chess:board')
  })

  /**
   * @example
   * expect(registerTool).toHaveBeenCalledWith(expect.objectContaining({ tool: expect.objectContaining({ id: 'play_chess' }) }))
   * expect(registerPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'chess-tools' }))
   */
  it('exposes toolKit as a module-scoped kit client without a gamelet runtime', async () => {
    const registerTool = vi.fn()
    const registerPrompt = vi.fn()

    const client = toolKit.createClient(createToolRuntime({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      moduleId: 'chess',
      register: registerTool,
      registerToolsetPrompt: registerPrompt,
    }))

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
   * expect(useKit).toHaveBeenCalledWith(toolKit)
   * expect(registerToolsetPrompt).toHaveBeenCalledBefore(registerTool)
   */
  it('registers a toolset prompt before module-scoped tools through the tool helper', async () => {
    const registerTool = vi.fn()
    const registerToolsetPrompt = vi.fn()
    const { module, useKit } = createToolModuleRef({
      id: 'chess',
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      register: registerTool,
      registerToolsetPrompt,
    })

    await registerTools(module, {
      prompt: {
        id: 'chess-tools',
        prompt: {
          id: 'airi-plugin-game-chess.prompt',
          title: 'Chess Plugin Guidance',
          content: 'Do not pass fen or pgn when mode is "new".',
        },
      },
      tools: [
        {
          id: 'play_chess',
          title: 'Play Chess',
          description: 'Open chess.',
          inputSchema: object({}),
          execute: async () => ({ ok: true }),
        },
      ],
    })

    expect(useKit).toHaveBeenCalledWith(toolKit)
    expect(registerToolsetPrompt).toHaveBeenCalledWith({
      id: 'chess-tools',
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

    expect(registerToolsetPrompt.mock.invocationCallOrder[0]).toBeLessThan(registerTool.mock.invocationCallOrder[0])
  })

  /**
   * @example
   * expect(registerToolsetPrompt).toHaveBeenCalledWith({ id: 'airi-plugin-game-chess.prompt', prompt: expect.any(Object) })
   * expect(registerTool).not.toHaveBeenCalled()
   */
  it('normalizes shorthand toolset prompts before registration', async () => {
    const registerTool = vi.fn()
    const registerToolsetPrompt = vi.fn()
    const { module } = createToolModuleRef({
      id: 'chess',
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      register: registerTool,
      registerToolsetPrompt,
    })

    await registerTools(module, {
      prompt: {
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
        content: 'Start chess directly.',
      },
      tools: [],
    })

    expect(registerToolsetPrompt).toHaveBeenCalledWith({
      id: 'airi-plugin-game-chess.prompt',
      prompt: {
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
        content: 'Start chess directly.',
      },
    })
    expect(registerTool).not.toHaveBeenCalled()
  })

  it('stores, invokes, and removes module-scoped Tamagotchi tools', async () => {
    const registry = new TamagotchiToolRegistry()
    const execute = vi.fn(async () => ({ ok: true }))

    registry.register({
      ownerSessionId: 'session-1',
      ownerExtensionId: 'airi-extension-chess',
      ownerModuleId: 'chess',
      tool: {
        id: 'play_chess',
        title: 'Play Chess',
        description: 'Open chess.',
        activation: {
          keywords: ['chess'],
          patterns: ['chess'],
        },
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      execute,
    })
    registry.registerToolsetPrompt({
      ownerSessionId: 'session-1',
      ownerExtensionId: 'airi-extension-chess',
      ownerModuleId: 'chess',
      toolset: {
        id: 'chess-tools',
        prompt: {
          id: 'airi-plugin-game-chess.prompt',
          content: 'Prefer legal chess moves.',
        },
      },
    })

    await expect(registry.listAvailableDescriptors()).resolves.toEqual([{
      id: 'play_chess',
      title: 'Play Chess',
      description: 'Open chess.',
      activation: {
        keywords: ['chess'],
        patterns: ['chess'],
      },
    }])
    await expect(registry.listSerializedXsaiTools()).resolves.toEqual({
      prompts: [{
        ownerExtensionId: 'airi-extension-chess',
        id: 'chess-tools',
        prompt: {
          id: 'airi-plugin-game-chess.prompt',
          content: 'Prefer legal chess moves.',
        },
      }],
      tools: [{
        ownerExtensionId: 'airi-extension-chess',
        name: 'play_chess',
        description: 'Open chess.',
        parameters: {
          type: 'object',
          properties: {},
        },
      }],
    })
    await expect(registry.invoke('airi-extension-chess', 'play_chess', { move: 'e4' })).resolves.toEqual({ ok: true })
    expect(execute).toHaveBeenCalledWith({ move: 'e4' })

    registry.unregisterOwnerScope('session-1', 'chess')

    await expect(registry.listSerializedXsaiTools()).resolves.toEqual({
      prompts: [],
      tools: [],
    })
    await expect(registry.invoke('airi-extension-chess', 'play_chess', {})).rejects.toThrow(
      'Tamagotchi extension tool not found: airi-extension-chess:play_chess',
    )
  })

  /**
   * @example
   * expect(registerBinding).toHaveBeenCalledWith(expect.objectContaining({ kitId: 'kit.gamelet' }))
   * expect(registerTool).toHaveBeenCalledWith(expect.objectContaining({ tool: expect.any(Object) }))
   */
  it('allows gamelet and tool kits to be composed without coupling tool registration to gamelets', async () => {
    const registerBinding = vi.fn()
    const registerTool = vi.fn()
    const registerToolsetPrompt = vi.fn()
    const gamelets = gameletKit.createClient(createGameletRuntime({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      moduleId: 'chess',
      bind: registerBinding,
    }))
    const tools = toolKit.createClient(createToolRuntime({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      moduleId: 'chess',
      register: registerTool,
      registerToolsetPrompt,
    }))

    await gamelets.mount({
      title: 'Chess',
      ui: gamelets.iframe({ assetPath: './ui/index.html' }),
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
      execute: async () => ({ ok: true }),
    })

    expect(registerToolsetPrompt).toHaveBeenCalledWith({
      id: 'chess-tools',
      prompt: {
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
        content: 'Do not pass fen or pgn when mode is "new".',
      },
    })
    expect(registerBinding).toHaveBeenCalledWith({
      moduleId: 'chess:gamelet',
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      config: {
        title: 'Chess',
        widget: {
          mount: 'iframe',
          iframe: {
            assetPath: './ui/index.html',
            sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
          },
        },
        config: {
          init: {},
        },
      },
    })
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

    await expect(registerTool.mock.calls[0]?.[0].execute({})).resolves.toEqual({ ok: true })
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
    const tools = toolKit.createClient(createToolRuntime({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      moduleId: 'chess',
      register: registerTool,
      registerToolsetPrompt: vi.fn(),
    }))

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
    const tools = toolKit.createClient(createToolRuntime({
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      moduleId: 'chess',
      register: registerTool,
      registerToolsetPrompt: vi.fn(),
    }))

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

  /**
   * @example
   * expect(registerBinding).toHaveBeenCalledWith(expect.objectContaining({ moduleId: 'chess:board' }))
   * expect(gamelet.bindingId).toBe('chess:board')
   */
  it('creates a gamelet helper with an explicit module-scoped binding id', async () => {
    const registerBinding = vi.fn()
    const { module, useKit } = createGameletModuleRef({
      id: 'chess',
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
      bind: registerBinding,
    })

    const gamelet = await createGamelet(module, {
      id: 'board',
      title: 'Chess',
      indexPath: './ui/index.html',
      init: { airiSide: 'black' },
    })

    expect(gamelet.id).toBe('board')
    expect(gamelet.bindingId).toBe('chess:board')
    expect(useKit).toHaveBeenCalledWith(gameletKit)
    expect(registerBinding).toHaveBeenCalledWith({
      moduleId: 'chess:board',
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      config: {
        title: 'Chess',
        widget: {
          mount: 'iframe',
          iframe: {
            assetPath: './ui/index.html',
            sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
          },
        },
        config: {
          init: { airiSide: 'black' },
        },
      },
    })
  })

  /**
   * @example
   * expect(gamelet.bindingId).toBe(`feature:${gamelet.id}`)
   */
  it('creates a gamelet helper with a generated id when omitted', async () => {
    const registerBinding = vi.fn()
    const { module } = createGameletModuleRef({
      id: 'feature',
      extensionId: 'airi-extension-feature',
      sessionId: 'session-1',
      bind: registerBinding,
    })

    const gamelet = await createGamelet(module, {
      title: 'Feature',
      indexPath: './ui/index.html',
    })

    expect(gamelet.id).not.toBe('')
    expect(gamelet.bindingId).toBe(`feature:${gamelet.id}`)
    expect(registerBinding).toHaveBeenCalledWith({
      moduleId: gamelet.bindingId,
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      config: {
        title: 'Feature',
        widget: {
          mount: 'iframe',
          iframe: {
            assetPath: './ui/index.html',
            sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
          },
        },
        config: {
          init: {},
        },
      },
    })
  })
})
