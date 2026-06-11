import type { ExtensionModuleContext, ExtensionSetupContext } from './index'

import { describe, expect, it, vi } from 'vitest'

import { createModule, defineExtension, DisposableStore } from './index'

function createTestExtensionContext(register: ExtensionSetupContext['modules']['register']): ExtensionSetupContext {
  return {
    extension: { id: 'extension-test', sessionId: 'session-1', version: '1.0.0' },
    subscriptions: new DisposableStore(),
    kits: { use: vi.fn(), tryUse: vi.fn(), watch: vi.fn() },
    modules: { register },
  }
}

function createTestModule(id: string, dispose = vi.fn(async () => {})): ExtensionModuleContext {
  return {
    id,
    identity: {
      id,
      extension: {
        id: 'extension-test',
        sessionId: 'session-1',
        version: '1.0.0',
      },
    },
    permissions: {},
    kits: { use: vi.fn(), tryUse: vi.fn(), watch: vi.fn() },
    subscriptions: new DisposableStore(),
    dispose,
  }
}

describe('defineExtension', () => {
  it('defines an extension with setup and module registration context', async () => {
    const setup = vi.fn(async () => {})
    const extension = defineExtension({
      id: 'airi-extension-test',
      version: '1.0.0',
      setup,
    })

    expect(extension.id).toBe('airi-extension-test')
    expect(extension.version).toBe('1.0.0')

    const subscriptions = new DisposableStore()
    await extension.setup({
      extension: {
        id: extension.id,
        version: extension.version,
        sessionId: 'session-1',
      },
      subscriptions,
      kits: {
        use: vi.fn(),
        tryUse: vi.fn(),
        watch: vi.fn(),
      },
      modules: {
        register: vi.fn(),
      },
    })

    expect(setup).toHaveBeenCalledTimes(1)
  })
})

describe('createModule', () => {
  it('registers a module with an explicit id and returns a narrow module ref', async () => {
    const dispose = vi.fn(async () => {})
    const module = createTestModule('module-explicit', dispose)
    const register = vi.fn(async () => module)
    const ctx = createTestExtensionContext(register)

    const ref = await createModule(ctx, { id: 'module-explicit' })

    expect(register).toHaveBeenCalledWith({ id: 'module-explicit' })
    expect(ref).toStrictEqual({
      id: 'module-explicit',
      kits: module.kits,
      subscriptions: module.subscriptions,
      dispose: expect.any(Function),
    })
    expect(ref).not.toHaveProperty('identity')
    expect(ref).not.toHaveProperty('permissions')
    expect(ref.dispose).not.toBe(module.dispose)

    await ctx.subscriptions.dispose()

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('disposes the underlying module once when the returned ref and setup context are both disposed', async () => {
    const dispose = vi.fn(async () => {})
    const module = createTestModule('module-idempotent', dispose)
    const register = vi.fn(async () => module)
    const ctx = createTestExtensionContext(register)

    const ref = await createModule(ctx, { id: 'module-idempotent' })

    await ref.dispose()
    await ctx.subscriptions.dispose()

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('waits for the in-flight module dispose when the returned ref and setup context dispose concurrently', async () => {
    let resolveDispose!: () => void
    const controlledDispose = new Promise<void>((resolve) => {
      resolveDispose = resolve
    })
    const dispose = vi.fn(() => controlledDispose)
    const module = createTestModule('module-concurrent', dispose)
    const register = vi.fn(async () => module)
    const ctx = createTestExtensionContext(register)

    const ref = await createModule(ctx, { id: 'module-concurrent' })

    const refDispose = ref.dispose()
    let ctxDisposeCompleted = false
    const ctxDispose = ctx.subscriptions.dispose().then(() => {
      ctxDisposeCompleted = true
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(ctxDisposeCompleted).toBe(false)

    resolveDispose()
    await Promise.all([refDispose, ctxDispose])

    expect(ctxDisposeCompleted).toBe(true)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('registers a module with a generated id when no explicit id is provided', async () => {
    const register = vi.fn(async ({ id }) => createTestModule(id))
    const ctx = createTestExtensionContext(register)

    const ref = await createModule(ctx)

    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0]?.[0].id).toEqual(expect.any(String))
    expect(register.mock.calls[0]?.[0].id).not.toBe('')
    expect(ref.id).toBe(register.mock.calls[0]?.[0].id)
  })
})
