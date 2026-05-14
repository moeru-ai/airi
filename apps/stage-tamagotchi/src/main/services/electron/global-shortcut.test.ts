import type { ShortcutBinding } from '@proj-airi/stage-shared/global-shortcut'
import type { BrowserWindow } from 'electron'

import type { EventaContext } from './global-shortcut'

import { ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function exampleBinding(id: string, key = 'KeyK'): ShortcutBinding {
  return {
    id,
    accelerator: { modifiers: ['cmd-or-ctrl', 'shift'], key },
    scope: 'global',
  }
}

interface MockContext {
  emit: ReturnType<typeof vi.fn>
  invokeHandlers: Map<string, (payload: unknown) => unknown>
}

interface MockWindow {
  on: ReturnType<typeof vi.fn>
  /** Manually trigger the registered `closed` handler. */
  close: () => void
}

function createMockContext(): MockContext {
  return {
    emit: vi.fn(),
    invokeHandlers: new Map(),
  }
}

// NOTICE:
// MockWindow only models what the driver touches: subscribing to a
// `'closed'` event. The mock exposes a manual `close()` so tests can
// assert the auto-cleanup path.
function createMockWindow(): MockWindow {
  let closedHandler: (() => void) | undefined
  return {
    on: vi.fn((event: string, handler: () => void) => {
      if (event === 'closed')
        closedHandler = handler
    }),
    close() {
      closedHandler?.()
    },
  }
}

// NOTICE:
// MockContext / MockWindow are intentionally minimal — only what the
// driver touches. Casting through `unknown` lets us pass them to
// `service.registerWindow` whose typed signature wants the full
// `EventaContext` and `BrowserWindow` types.
function asEventaContext(ctx: MockContext): EventaContext {
  return ctx as unknown as EventaContext
}

function asBrowserWindow(window: MockWindow): BrowserWindow {
  return window as unknown as BrowserWindow
}

function registerMockWindow(service: { registerWindow: (params: { context: EventaContext, window: BrowserWindow }) => void }, ctx: MockContext): MockWindow {
  const window = createMockWindow()
  service.registerWindow({
    context: asEventaContext(ctx),
    window: asBrowserWindow(window),
  })
  return window
}

/**
 * Mocks the heavy collaborators (`electron`, eventa, bootkit, logger)
 * so the driver can be exercised through its public interface in a
 * single test file.
 */
async function setupMocks() {
  const registerMock = vi.fn<(accelerator: string, callback: () => void) => boolean>(() => true)
  const unregisterMock = vi.fn<(accelerator: string) => void>()
  const unregisterAllMock = vi.fn<() => void>()
  const triggerCallbacks = new Map<string, () => void>()

  registerMock.mockImplementation((accelerator, callback) => {
    triggerCallbacks.set(accelerator, callback)
    return true
  })
  unregisterMock.mockImplementation((accelerator) => {
    triggerCallbacks.delete(accelerator)
  })
  unregisterAllMock.mockImplementation(() => {
    triggerCallbacks.clear()
  })

  const onAppBeforeQuitMock = vi.fn<(fn: () => void | Promise<void>) => void>()

  vi.doMock('electron', () => ({
    globalShortcut: {
      register: registerMock,
      unregister: unregisterMock,
      unregisterAll: unregisterAllMock,
    },
  }))

  vi.doMock('@moeru/eventa', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@moeru/eventa')>()
    return {
      ...actual,
      defineInvokeHandler: (context: MockContext, eventa: { sendEvent: { id: string } }, handler: (payload: unknown) => unknown) => {
        // `defineInvokeEventa('foo')` returns `{ sendEvent: { id: 'foo-send' }, ... }`;
        // strip the `-send` suffix so test lookups match the contract name.
        const id = eventa.sendEvent.id.replace(/-send$/, '')
        context.invokeHandlers.set(id, handler)
      },
    }
  })

  vi.doMock('../../libs/bootkit/lifecycle', () => ({
    onAppBeforeQuit: onAppBeforeQuitMock,
  }))

  vi.doMock('@guiiai/logg', () => ({
    useLogg: () => ({
      useGlobalConfig: () => ({
        warn: vi.fn(),
        withError: vi.fn(() => ({ warn: vi.fn() })),
      }),
    }),
  }))

  const { setupGlobalShortcutService } = await import('./global-shortcut')

  return {
    setupGlobalShortcutService,
    registerMock,
    unregisterMock,
    unregisterAllMock,
    triggerCallbacks,
    onAppBeforeQuitMock,
  }
}

describe('setupGlobalShortcutService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('registers a binding via the invoke handler', async () => {
    const m = await setupMocks()
    const service = m.setupGlobalShortcutService()
    const ctx = createMockContext()
    registerMockWindow(service, ctx)

    const handler = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:register')
    expect(handler).toBeDefined()

    const result = handler!(exampleBinding('toggle')) as { id: string, ok: boolean }
    expect(result).toEqual({ id: 'toggle', ok: true })
    expect(m.registerMock).toHaveBeenCalledWith('CmdOrCtrl+Shift+K', expect.any(Function))
  })

  it('refuses receiveKeyUps with reason "unsupported" and does not call globalShortcut', async () => {
    // Electron's `globalShortcut` does not deliver key-release
    // events. The driver refuses `receiveKeyUps: true` honestly so
    // callers can switch to (or fail back from) the uiohook driver
    // path that will handle it.
    const m = await setupMocks()
    const service = m.setupGlobalShortcutService()
    const ctx = createMockContext()
    registerMockWindow(service, ctx)

    const handler = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:register')!
    const result = handler({ ...exampleBinding('ptt'), receiveKeyUps: true }) as { id: string, ok: boolean, reason?: string }
    expect(result).toEqual({ id: 'ptt', ok: false, reason: ShortcutFailureReasons.Unsupported })
    expect(m.registerMock).not.toHaveBeenCalled()
  })

  it('reports conflict when globalShortcut.register returns false', async () => {
    const m = await setupMocks()
    m.registerMock.mockImplementationOnce(() => false)
    const service = m.setupGlobalShortcutService()
    const ctx = createMockContext()
    registerMockWindow(service, ctx)

    const handler = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:register')!
    const result = handler(exampleBinding('toggle')) as { id: string, ok: boolean, reason?: string }
    expect(result).toEqual({ id: 'toggle', ok: false, reason: ShortcutFailureReasons.Conflict })
  })

  it('rejects duplicate id with reason "duplicate-id" without touching globalShortcut', async () => {
    // Strict registration: the second register call under the same id
    // must fail explicitly so silent overrides between unrelated
    // registration sites cannot happen. Callers rebind by calling
    // `unregister` first.
    const m = await setupMocks()
    const service = m.setupGlobalShortcutService()
    const ctx = createMockContext()
    registerMockWindow(service, ctx)

    const handler = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:register')!
    const first = handler(exampleBinding('toggle', 'KeyK')) as { ok: boolean }
    const second = handler(exampleBinding('toggle', 'KeyZ')) as { id: string, ok: boolean, reason?: string }

    expect(first.ok).toBe(true)
    expect(second).toEqual({ id: 'toggle', ok: false, reason: ShortcutFailureReasons.DuplicateId })
    expect(m.registerMock).toHaveBeenCalledTimes(1)
    expect(m.unregisterMock).not.toHaveBeenCalled()
  })

  it('allows re-register after explicit unregister', async () => {
    const m = await setupMocks()
    const service = m.setupGlobalShortcutService()
    const ctx = createMockContext()
    registerMockWindow(service, ctx)

    const reg = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:register')!
    const unreg = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:unregister')!

    reg(exampleBinding('toggle', 'KeyK'))
    unreg({ id: 'toggle' })
    const result = reg(exampleBinding('toggle', 'KeyZ')) as { ok: boolean }

    expect(result.ok).toBe(true)
    expect(m.registerMock).toHaveBeenLastCalledWith('CmdOrCtrl+Shift+Z', expect.any(Function))
  })

  it('broadcasts a "down" trigger to every registered context', async () => {
    const m = await setupMocks()
    const service = m.setupGlobalShortcutService()
    const ctxA = createMockContext()
    const ctxB = createMockContext()
    registerMockWindow(service, ctxA)
    registerMockWindow(service, ctxB)

    const handler = ctxA.invokeHandlers.get('eventa:invoke:electron:shortcut:register')!
    handler(exampleBinding('toggle'))

    const callback = m.triggerCallbacks.get('CmdOrCtrl+Shift+K')
    expect(callback).toBeDefined()
    callback!()

    expect(ctxA.emit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'eventa:event:electron:shortcut:triggered' }),
      { id: 'toggle', phase: 'down' },
    )
    expect(ctxB.emit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'eventa:event:electron:shortcut:triggered' }),
      { id: 'toggle', phase: 'down' },
    )
  })

  it('unregister removes the active binding', async () => {
    const m = await setupMocks()
    const service = m.setupGlobalShortcutService()
    const ctx = createMockContext()
    registerMockWindow(service, ctx)

    const reg = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:register')!
    reg(exampleBinding('toggle'))
    const unreg = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:unregister')!
    unreg({ id: 'toggle' })

    expect(m.unregisterMock).toHaveBeenCalledWith('CmdOrCtrl+Shift+K')
  })

  it('list returns currently active bindings', async () => {
    const m = await setupMocks()
    const service = m.setupGlobalShortcutService()
    const ctx = createMockContext()
    registerMockWindow(service, ctx)

    const reg = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:register')!
    reg(exampleBinding('a', 'KeyA'))
    reg(exampleBinding('b', 'KeyB'))

    const list = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:list')!
    const result = list(undefined) as ShortcutBinding[]
    expect(result.map(b => b.id).sort()).toEqual(['a', 'b'])
  })

  it('unregisterAll only unregisters bindings owned by this service', async () => {
    const m = await setupMocks()
    const service = m.setupGlobalShortcutService()
    const ctx = createMockContext()
    registerMockWindow(service, ctx)

    const reg = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:register')!
    reg(exampleBinding('a', 'KeyA'))
    reg(exampleBinding('b', 'KeyB'))
    const unregAll = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:unregister-all')!
    unregAll(undefined)

    expect(m.unregisterAllMock).not.toHaveBeenCalled()
    expect(m.unregisterMock).toHaveBeenCalledTimes(2)
    expect(m.unregisterMock).toHaveBeenCalledWith('CmdOrCtrl+Shift+A')
    expect(m.unregisterMock).toHaveBeenCalledWith('CmdOrCtrl+Shift+B')

    const list = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:list')!
    expect(list(undefined)).toEqual([])
  })

  it('removes a context from broadcast set when its window closes', async () => {
    const m = await setupMocks()
    const service = m.setupGlobalShortcutService()

    const ctxA = createMockContext()
    const ctxB = createMockContext()
    const winA = registerMockWindow(service, ctxA)
    registerMockWindow(service, ctxB)

    const handler = ctxA.invokeHandlers.get('eventa:invoke:electron:shortcut:register')!
    handler(exampleBinding('toggle'))

    // ctxA's window closes; subsequent triggers should only reach ctxB
    winA.close()
    const callback = m.triggerCallbacks.get('CmdOrCtrl+Shift+K')!
    callback()

    expect(ctxA.emit).not.toHaveBeenCalled()
    expect(ctxB.emit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'eventa:event:electron:shortcut:triggered' }),
      { id: 'toggle', phase: 'down' },
    )
  })

  it('hooks dispose into onAppBeforeQuit and clears state on call', async () => {
    const m = await setupMocks()
    const service = m.setupGlobalShortcutService()
    expect(m.onAppBeforeQuitMock).toHaveBeenCalledTimes(1)

    const ctx = createMockContext()
    registerMockWindow(service, ctx)
    const reg = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:register')!
    reg(exampleBinding('a'))

    service.dispose()
    expect(m.unregisterMock).toHaveBeenCalledWith('CmdOrCtrl+Shift+K')

    // After dispose, a fresh trigger callback should not reach contexts
    const callback = m.triggerCallbacks.get('CmdOrCtrl+Shift+K')
    callback?.()
    expect(ctx.emit).not.toHaveBeenCalled()
  })

  it('rejects malformed register payloads at the IPC boundary', async () => {
    const m = await setupMocks()
    const service = m.setupGlobalShortcutService()
    const ctx = createMockContext()
    registerMockWindow(service, ctx)

    const reg = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:register')!
    expect(() => reg({})).toThrow(TypeError)
    expect(() => reg({ id: 'no-accel' })).toThrow(TypeError)
    expect(() => reg({ accelerator: { modifiers: [], key: 'KeyK' } })).toThrow(TypeError)
    expect(m.registerMock).not.toHaveBeenCalled()
  })

  it('ignores unregister payloads with missing id and skips unknown ids', async () => {
    // The Eventa contract types `payload` as `{ id: string }`, so a
    // `null`/`undefined` payload is a programmer error and surfaces as
    // a thrown TypeError. A well-shaped payload with an empty or
    // unknown id is a no-op.
    const m = await setupMocks()
    const service = m.setupGlobalShortcutService()
    const ctx = createMockContext()
    registerMockWindow(service, ctx)

    const unreg = ctx.invokeHandlers.get('eventa:invoke:electron:shortcut:unregister')!
    expect(() => unreg({ id: '' })).not.toThrow()
    expect(() => unreg({ id: 'never-registered' })).not.toThrow()
    expect(m.unregisterMock).not.toHaveBeenCalled()
  })
})
