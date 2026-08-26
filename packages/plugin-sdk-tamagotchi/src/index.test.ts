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
import { object, optional, picklist, string } from 'valibot'
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

type GameletOrchestrationRuntime = NonNullable<ReturnType<typeof gameletKit.createClient>['orchestration']>
type ToolRuntimeServices = NonNullable<ToolKitRuntime['tools']>

function createGameletModuleRef(input: {
  bind: (input: unknown) => Promise<unknown> | unknown
  extensionId: string
  gamelets?: GameletOrchestrationRuntime
  id: string
  sessionId: string
}): { module: ExtensionModuleRef, useKit: ReturnType<typeof vi.fn> } {
  const useKit = vi.fn()

  const module: ExtensionModuleRef = {
    dispose: vi.fn(async () => {}),
    id: input.id,
    kits: {
      async tryUse<TClient>(kit: KitRef<TClient>): Promise<KitUseResult<TClient>> {
        return {
          error: new Error(`Unused test kit lookup: ${kit.id}`),
          ok: false,
          reason: 'missing-kit',
        }
      },
      async use<TClient>(kit: KitRef<TClient>): Promise<TClient> {
        useKit(kit)
        if (kit !== gameletKit) {
          throw new Error(`Unexpected kit requested: ${kit.id}`)
        }

        return gameletKit.createClient(createGameletRuntime({
          bind: input.bind,
          extensionId: input.extensionId,
          gamelets: input.gamelets,
          moduleId: input.id,
          sessionId: input.sessionId,
        })) as TClient
      },
      watch<TClient>(
        _kit: KitRef<TClient>,
        _callback: (availability: KitAvailability<TClient>) => Promise<void> | void,
      ) {
        return { dispose: vi.fn() }
      },
    },
    subscriptions: new DisposableStore(),
  }

  return { module, useKit }
}

function createGameletRuntime(input: {
  bind: (input: unknown) => Promise<unknown> | unknown
  extensionId: string
  gamelets?: GameletOrchestrationRuntime
  moduleId?: string
  sessionId: string
}): KitClientRuntime & {
  bindings: {
    bind: (input: unknown) => Promise<unknown> | unknown
  }
  gamelets?: GameletOrchestrationRuntime
} {
  return {
    bindings: {
      bind: input.bind,
    },
    extensionId: input.extensionId,
    gamelets: input.gamelets,
    moduleId: input.moduleId,
    sessionId: input.sessionId,
    subscriptions: new DisposableStore(),
  }
}

function createToolModuleRef(input: {
  extensionId: string
  id: string
  register: ToolRuntimeServices['register']
  registerToolsetPrompt: ToolRuntimeServices['registerToolsetPrompt']
  sessionId: string
}): { module: ExtensionModuleRef, useKit: ReturnType<typeof vi.fn> } {
  const useKit = vi.fn()

  const module: ExtensionModuleRef = {
    dispose: vi.fn(async () => {}),
    id: input.id,
    kits: {
      async tryUse<TClient>(kit: KitRef<TClient>): Promise<KitUseResult<TClient>> {
        return {
          error: new Error(`Unused test kit lookup: ${kit.id}`),
          ok: false,
          reason: 'missing-kit',
        }
      },
      async use<TClient>(kit: KitRef<TClient>): Promise<TClient> {
        useKit(kit)
        if (kit !== toolKit) {
          throw new Error(`Unexpected kit requested: ${kit.id}`)
        }

        return toolKit.createClient(createToolRuntime({
          extensionId: input.extensionId,
          moduleId: input.id,
          register: input.register,
          registerToolsetPrompt: input.registerToolsetPrompt,
          sessionId: input.sessionId,
        })) as TClient
      },
      watch<TClient>(
        _kit: KitRef<TClient>,
        _callback: (availability: KitAvailability<TClient>) => Promise<void> | void,
      ) {
        return { dispose: vi.fn() }
      },
    },
    subscriptions: new DisposableStore(),
  }

  return { module, useKit }
}

function createToolRuntime(input: {
  extensionId: string
  moduleId?: string
  register: ToolRuntimeServices['register']
  registerToolsetPrompt: ToolRuntimeServices['registerToolsetPrompt']
  sessionId: string
}): ToolKitRuntime {
  return {
    extensionId: input.extensionId,
    moduleId: input.moduleId,
    sessionId: input.sessionId,
    subscriptions: new DisposableStore(),
    tools: {
      register: input.register,
      registerToolsetPrompt: input.registerToolsetPrompt,
    },
  }
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
      bind: async (input: unknown) => {
        bindings.push(input)
        return { moduleId: 'chess:gamelet', state: 'active' }
      },
      extensionId: 'airi-extension-chess',
      moduleId: 'chess',
      sessionId: 'session-1',
    }))

    await client.mount({
      init: { airiSide: 'black' },
      title: 'Chess',
      ui: client.iframe({ assetPath: 'ui/index.html' }),
    })

    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      moduleId: 'chess:gamelet',
    })
  })

  /**
   * @example
   * expect(bindings[0]).toMatchObject({ moduleId: 'session-1:gamelet' })
   */
  it('derives a stable gameletKit binding id for extension-scoped clients', async () => {
    const bindings: unknown[] = []
    const client = gameletKit.createClient(createGameletRuntime({
      bind: async (input: unknown) => {
        bindings.push(input)
        return { moduleId: 'session-1:gamelet', state: 'active' }
      },
      extensionId: 'airi-extension-chess',
      sessionId: 'session-1',
    }))

    await client.mount({
      title: 'Chess',
      ui: client.iframe({ assetPath: 'ui/index.html' }),
    })

    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      moduleId: 'session-1:gamelet',
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
    const requestCalls: [string, HostDataRecord, undefined | { timeoutMs?: number }][] = []
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
      bind: async () => ({ moduleId: 'chess:board', state: 'active' }),
      extensionId: 'airi-extension-chess',
      gamelets: {
        close,
        configure,
        isOpen,
        open,
        request,
      },
      id: 'chess',
      sessionId: 'session-1',
    })

    const handle = await createGamelet(module, {
      id: 'board',
      indexPath: 'ui/index.html',
      title: 'Chess Board',
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
      bind: async () => ({ moduleId: 'chess:board', state: 'active' }),
      extensionId: 'airi-extension-chess',
      id: 'chess',
      sessionId: 'session-1',
    })

    const handle = await createGamelet(module, {
      id: 'board',
      indexPath: 'ui/index.html',
      title: 'Chess Board',
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
      bind: async () => ({ moduleId: 'chess:board', state: 'active' }),
      extensionId: 'airi-extension-chess',
      gamelets: {
        close,
        configure: vi.fn(),
        isOpen: vi.fn(),
        open: vi.fn(),
        request: vi.fn(),
      },
      id: 'chess',
      sessionId: 'session-1',
    })

    await createGamelet(module, {
      id: 'board',
      indexPath: 'ui/index.html',
      title: 'Chess Board',
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
      moduleId: 'chess',
      register: registerTool,
      registerToolsetPrompt: registerPrompt,
      sessionId: 'session-1',
    }))

    await client.registerToolsetPrompt({
      id: 'chess-toolset',
      prompt: {
        content: 'Do not pass fen or pgn when mode is "new".',
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
      },
    })
    await client.registerTool({
      description: 'Open chess.',
      execute: async () => ({ ok: true }),
      id: 'play_chess',
      inputSchema: object({}),
      title: 'Play Chess',
    })

    expect(registerPrompt).toHaveBeenCalledWith({
      id: 'chess-toolset',
      prompt: {
        content: 'Do not pass fen or pgn when mode is "new".',
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
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
      extensionId: 'airi-extension-chess',
      id: 'chess',
      register: registerTool,
      registerToolsetPrompt,
      sessionId: 'session-1',
    })

    await registerTools(module, {
      prompt: {
        id: 'chess-tools',
        prompt: {
          content: 'Do not pass fen or pgn when mode is "new".',
          id: 'airi-plugin-game-chess.prompt',
          title: 'Chess Plugin Guidance',
        },
      },
      tools: [
        {
          description: 'Open chess.',
          execute: async () => ({ ok: true }),
          id: 'play_chess',
          inputSchema: object({}),
          title: 'Play Chess',
        },
      ],
    })

    expect(useKit).toHaveBeenCalledWith(toolKit)
    expect(registerToolsetPrompt).toHaveBeenCalledWith({
      id: 'chess-tools',
      prompt: {
        content: 'Do not pass fen or pgn when mode is "new".',
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
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
      extensionId: 'airi-extension-chess',
      id: 'chess',
      register: registerTool,
      registerToolsetPrompt,
      sessionId: 'session-1',
    })

    await registerTools(module, {
      prompt: {
        content: 'Start chess directly.',
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
      },
      tools: [],
    })

    expect(registerToolsetPrompt).toHaveBeenCalledWith({
      id: 'airi-plugin-game-chess.prompt',
      prompt: {
        content: 'Start chess directly.',
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
      },
    })
    expect(registerTool).not.toHaveBeenCalled()
  })

  it('stores, invokes, and removes module-scoped Tamagotchi tools', async () => {
    const registry = new TamagotchiToolRegistry()
    const execute = vi.fn(async () => ({ ok: true }))

    registry.register({
      execute,
      ownerExtensionId: 'airi-extension-chess',
      ownerModuleId: 'chess',
      ownerSessionId: 'session-1',
      tool: {
        activation: {
          keywords: ['chess'],
          patterns: ['chess'],
        },
        description: 'Open chess.',
        id: 'play_chess',
        parameters: {
          properties: {},
          type: 'object',
        },
        title: 'Play Chess',
      },
    })
    registry.registerToolsetPrompt({
      ownerExtensionId: 'airi-extension-chess',
      ownerModuleId: 'chess',
      ownerSessionId: 'session-1',
      toolset: {
        id: 'chess-tools',
        prompt: {
          content: 'Prefer legal chess moves.',
          id: 'airi-plugin-game-chess.prompt',
        },
      },
    })

    await expect(registry.listAvailableDescriptors()).resolves.toEqual([{
      activation: {
        keywords: ['chess'],
        patterns: ['chess'],
      },
      description: 'Open chess.',
      id: 'play_chess',
      title: 'Play Chess',
    }])
    await expect(registry.listSerializedXsaiTools()).resolves.toEqual({
      prompts: [{
        id: 'chess-tools',
        ownerExtensionId: 'airi-extension-chess',
        prompt: {
          content: 'Prefer legal chess moves.',
          id: 'airi-plugin-game-chess.prompt',
        },
      }],
      tools: [{
        description: 'Open chess.',
        name: 'play_chess',
        ownerExtensionId: 'airi-extension-chess',
        parameters: {
          properties: {},
          type: 'object',
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
      bind: registerBinding,
      extensionId: 'airi-extension-chess',
      moduleId: 'chess',
      sessionId: 'session-1',
    }))
    const tools = toolKit.createClient(createToolRuntime({
      extensionId: 'airi-extension-chess',
      moduleId: 'chess',
      register: registerTool,
      registerToolsetPrompt,
      sessionId: 'session-1',
    }))

    await gamelets.mount({
      title: 'Chess',
      ui: gamelets.iframe({ assetPath: './ui/index.html' }),
    })

    await tools.registerToolsetPrompt({
      id: 'chess-tools',
      prompt: {
        content: 'Do not pass fen or pgn when mode is "new".',
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
      },
    })
    await tools.registerTool({
      description: 'Open chess.',
      execute: async () => ({ ok: true }),
      id: 'play_chess',
      inputSchema: object({
        opening: optional(string()),
      }),
      title: 'Play Chess',
    })

    expect(registerToolsetPrompt).toHaveBeenCalledWith({
      id: 'chess-tools',
      prompt: {
        content: 'Do not pass fen or pgn when mode is "new".',
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
      },
    })
    expect(registerBinding).toHaveBeenCalledWith({
      config: {
        config: {
          init: {},
        },
        title: 'Chess',
        widget: {
          iframe: {
            assetPath: './ui/index.html',
            sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
          },
          mount: 'iframe',
        },
      },
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      moduleId: 'chess:gamelet',
    })
    expect(registerTool).toHaveBeenCalledWith(expect.objectContaining({
      tool: expect.objectContaining({
        id: 'play_chess',
        parameters: expect.objectContaining({
          properties: expect.objectContaining({
            opening: expect.objectContaining({
              type: ['string', 'null'],
            }),
          }),
          required: ['opening'],
          type: 'object',
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
      close: closeGamelet,
      configure: configureGamelet,
      isOpen: isGameletOpen,
      open: openGamelet,
      request: vi.fn<(id: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>>(async () => ({ ready: true })),
    }
    const tools = toolKit.createClient(createToolRuntime({
      extensionId: 'airi-extension-chess',
      moduleId: 'chess',
      register: registerTool,
      registerToolsetPrompt: vi.fn(),
      sessionId: 'session-1',
    }))

    await tools.registerTool({
      description: 'Drive a host-backed chess gamelet.',
      async execute() {
        await gamelets.open('chess', { opening: 'sicilian' })
        await gamelets.configure('chess', { side: 'black' })
        await gamelets.request('chess', { action: 'snapshot' })
        await gamelets.close('chess')

        return { ok: true }
      },
      id: 'drive_chess',
      inputSchema: object({}),
      isAvailable: async () => await gamelets.isOpen('chess'),
      title: 'Drive Chess',
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
      moduleId: 'chess',
      register: registerTool,
      registerToolsetPrompt: vi.fn(),
      sessionId: 'session-1',
    }))

    await tools.registerTool({
      description: 'Open chess.',
      execute: async () => ({ ok: true }),
      id: 'play_chess',
      inputSchema: object({
        mode: string(),
        opening: optional(string()),
      }),
      title: 'Play Chess',
    })

    const parameters = registerTool.mock.calls[0]?.[0].tool.parameters

    expect(parameters.required).toEqual(['mode', 'opening'])
    expect(parameters.properties.opening.type).toEqual(['string', 'null'])
  })

  // ROOT CAUSE:
  //
  // The normalizer added null to an optional enum but kept type: "string".
  // OpenAI rejected the schema because null does not satisfy the string type.
  // The fix must allow null in both type and enum.
  it('serializes optional enum tool fields as nullable enum properties', async () => {
    const registerTool = vi.fn()
    const tools = toolKit.createClient(createToolRuntime({
      extensionId: 'airi-extension-chess',
      moduleId: 'chess',
      register: registerTool,
      registerToolsetPrompt: vi.fn(),
      sessionId: 'session-1',
    }))

    await tools.registerTool({
      description: 'placeholder-description',
      execute: async () => ({ ok: true }),
      id: 'play_chess',
      inputSchema: object({
        airiSide: optional(picklist(['white', 'black'])),
      }),
      title: 'placeholder-title',
    })

    const parameters = registerTool.mock.calls[0]?.[0].tool.parameters

    expect(parameters.required).toEqual(['airiSide'])
    expect(parameters.properties.airiSide.type).toEqual(['string', 'null'])
    expect(parameters.properties.airiSide.enum).toEqual(['white', 'black', null])
  })

  /**
   * @example
   * expect(registerBinding).toHaveBeenCalledWith(expect.objectContaining({ moduleId: 'chess:board' }))
   * expect(gamelet.bindingId).toBe('chess:board')
   */
  it('creates a gamelet helper with an explicit module-scoped binding id', async () => {
    const registerBinding = vi.fn()
    const { module, useKit } = createGameletModuleRef({
      bind: registerBinding,
      extensionId: 'airi-extension-chess',
      id: 'chess',
      sessionId: 'session-1',
    })

    const gamelet = await createGamelet(module, {
      id: 'board',
      indexPath: './ui/index.html',
      init: { airiSide: 'black' },
      title: 'Chess',
    })

    expect(gamelet.id).toBe('board')
    expect(gamelet.bindingId).toBe('chess:board')
    expect(useKit).toHaveBeenCalledWith(gameletKit)
    expect(registerBinding).toHaveBeenCalledWith({
      config: {
        config: {
          init: { airiSide: 'black' },
        },
        title: 'Chess',
        widget: {
          iframe: {
            assetPath: './ui/index.html',
            sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
          },
          mount: 'iframe',
        },
      },
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      moduleId: 'chess:board',
    })
  })

  /**
   * @example
   * expect(gamelet.bindingId).toBe(`feature:${gamelet.id}`)
   */
  it('creates a gamelet helper with a generated id when omitted', async () => {
    const registerBinding = vi.fn()
    const { module } = createGameletModuleRef({
      bind: registerBinding,
      extensionId: 'airi-extension-feature',
      id: 'feature',
      sessionId: 'session-1',
    })

    const gamelet = await createGamelet(module, {
      indexPath: './ui/index.html',
      title: 'Feature',
    })

    expect(gamelet.id).not.toBe('')
    expect(gamelet.bindingId).toBe(`feature:${gamelet.id}`)
    expect(registerBinding).toHaveBeenCalledWith({
      config: {
        config: {
          init: {},
        },
        title: 'Feature',
        widget: {
          iframe: {
            assetPath: './ui/index.html',
            sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
          },
          mount: 'iframe',
        },
      },
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      moduleId: gamelet.bindingId,
    })
  })
})
