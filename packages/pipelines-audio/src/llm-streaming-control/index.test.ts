import { describe, expect, it, vi } from 'vitest'

import { createStreamingControlParser } from '.'

describe('createStreamingControlParser', () => {
  /**
   * @example
   * const control = createStreamingControlParser()
   * expect(control.match('<|CALL ["chess.play"]|>')).toBe(true)
   */
  it('matches loaded control syntax', () => {
    const control = createStreamingControlParser()

    expect(control.match('<|CALL ["chess.play"]|>')).toBe(true)
    expect(control.match('<|ACT {"emotion":"happy"}|>')).toBe(true)
    expect(control.match('<|DELAY 1|>')).toBe(true)
  })

  /**
   * @example
   * control.on('plugin.action', handler)
   * await control.dispatchWith('<|CALL ["plugin.action"]|>')
   * expect(handler).toHaveBeenCalled()
   */
  it('dispatches CALL tokens to registered handlers', async () => {
    const control = createStreamingControlParser()
    const handler = vi.fn()
    const dispose = control.on({
      name: 'plugin.action',
      prompt: 'Run the plugin action when the model is ready.',
      examples: [
        '<|CALL ["plugin.action", {"value":1}]|>',
      ],
    }, handler)

    await expect(control.dispatchWith('<|CALL ["plugin.action", {"value":1}]|>', {
      intentId: 'intent-1',
      streamId: 'stream-1',
    })).resolves.toBe(true)

    expect(handler).toHaveBeenCalledWith(
      { value: 1 },
      expect.objectContaining({
        intentId: 'intent-1',
        streamId: 'stream-1',
      }),
    )

    dispose()
  })

  /**
   * @example
   * const turn = control.beginTurn({ turnId: 'turn-1' })
   * turn.on({ name: 'plugin.action', prompt: 'Run it.' }, handler)
   * await control.dispatchWith('<|CALL ["plugin.action"]|>', { turnId: 'turn-1' })
   * expect(handler).toHaveBeenCalled()
   */
  it('dispatches CALL tokens to turn-scoped handlers', async () => {
    const control = createStreamingControlParser()
    const handler = vi.fn()
    const turn = control.beginTurn({ turnId: 'turn-1' })
    turn.on({
      name: 'plugin.action',
      prompt: 'Run the plugin action when the turn reaches this point.',
    }, handler)

    await expect(control.dispatchWith('<|CALL ["plugin.action"]|>', {
      turnId: 'turn-1',
    })).resolves.toBe(true)

    expect(handler).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        turnId: 'turn-1',
      }),
    )

    turn.complete()
    await expect(turn.done).resolves.toEqual({ type: 'completed' })
  })

  it('uses turn-scoped handlers instead of global handlers for the same CALL name', async () => {
    const control = createStreamingControlParser()
    const globalHandler = vi.fn()
    const turnHandler = vi.fn()
    const disposeGlobal = control.on({
      name: 'plugin.action',
      prompt: 'Run the global plugin action.',
    }, globalHandler)
    const turn = control.beginTurn({ turnId: 'turn-1' })
    const disposeTurn = turn.on({
      name: 'plugin.action',
      prompt: 'Run the turn-local plugin action.',
    }, turnHandler)

    await expect(control.dispatchWith('<|CALL ["plugin.action"]|>', {
      turnId: 'turn-1',
    })).resolves.toBe(true)

    expect(turnHandler).toHaveBeenCalledTimes(1)
    expect(globalHandler).not.toHaveBeenCalled()

    disposeTurn()
    disposeGlobal()
    turn.complete()
  })

  /**
   * @example
   * const turn = control.beginTurn({ turnId: 'turn-1' })
   * control.completeTurn('turn-1')
   * await expect(turn.done).resolves.toEqual({ type: 'completed' })
   */
  it('settles turn lifecycle independently from CALL dispatch', async () => {
    const control = createStreamingControlParser()
    const turn = control.beginTurn({ turnId: 'turn-1' })

    control.completeTurn('turn-1')

    await expect(turn.done).resolves.toEqual({ type: 'completed' })
  })

  /**
   * @example
   * const dispatchPromise = control.dispatchWith('<|CALL ["plugin.action"]|>')
   * expect(settled).toBe(false)
   * resolveHandler()
   * await dispatchPromise
   */
  it('awaits registered handlers before resolving dispatch', async () => {
    const control = createStreamingControlParser()
    let resolveHandler: (() => void) | undefined
    let settled = false
    const dispose = control.on({
      name: 'plugin.action',
      prompt: 'Run the plugin action when the model is ready.',
    }, async () => {
      await new Promise<void>((resolve) => {
        resolveHandler = resolve
      })
    })

    const dispatchPromise = control.dispatchWith('<|CALL ["plugin.action"]|>')
      .then(() => {
        settled = true
      })

    await Promise.resolve()
    expect(settled).toBe(false)

    resolveHandler?.()
    await dispatchPromise
    expect(settled).toBe(true)

    dispose()
  })

  /**
   * @example
   * await expect(control.dispatchWith('<|CALL []|>')).resolves.toBe(false)
   */
  it('rejects invalid CALL payload shapes', async () => {
    const control = createStreamingControlParser()
    const handler = vi.fn()
    const dispose = control.on({
      name: 'plugin.action',
      prompt: 'Run the plugin action when the model is ready.',
    }, handler)

    await expect(control.dispatchWith('<|CALL {"name":"plugin.action"}|>')).resolves.toBe(false)
    await expect(control.dispatchWith('<|CALL []|>')).resolves.toBe(false)
    await expect(control.dispatchWith('<|CALL [""]|>')).resolves.toBe(false)
    await expect(control.dispatchWith('<|CALL ["plugin.action", []]|>')).resolves.toBe(false)
    await expect(control.dispatchWith('<|CALL ["plugin.action", {}, "extra"]|>')).resolves.toBe(false)
    await expect(control.dispatchWith('<|CALL not-json|>')).resolves.toBe(false)
    expect(handler).not.toHaveBeenCalled()

    dispose()
  })

  /**
   * @example
   * control.onSignal(handler)
   * await control.dispatchWith('<|ACT {"emotion":{"name":"happy","intensity":0.8},"motion":"nod"}|>')
   * expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'act' }))
   */
  it('dispatches ACT object literal tokens as structured signals', async () => {
    const control = createStreamingControlParser()
    const handler = vi.fn()
    const dispose = control.onSignal(handler)

    await expect(control.dispatchWith('<|ACT {"emotion":{"name":"happy","intensity":0.8},"motion":"nod"}|>')).resolves.toBe(true)

    expect(handler).toHaveBeenCalledWith(
      {
        type: 'act',
        payload: {
          emotion: { name: 'happy', intensity: 0.8 },
          motion: 'nod',
        },
      },
      expect.objectContaining({
        createdAt: expect.any(Number),
      }),
    )

    dispose()
  })

  /**
   * @example
   * control.onSignal(handler)
   * await control.dispatchWith('<|DELAY 1.5|>')
   * expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'delay' }))
   */
  it('dispatches DELAY numeric literal tokens as structured signals', async () => {
    const control = createStreamingControlParser()
    const handler = vi.fn()
    const dispose = control.onSignal(handler)

    await expect(control.dispatchWith('<|DELAY 1.5|>')).resolves.toBe(true)

    expect(handler).toHaveBeenCalledWith(
      {
        type: 'delay',
        seconds: 1.5,
      },
      expect.objectContaining({
        createdAt: expect.any(Number),
      }),
    )

    dispose()
  })

  /**
   * @example
   * await control.dispatchWith('<|ACT:"emotion":{"name":"happy"}|>')
   * // -> false
   */
  it('rejects non-standard ACT and DELAY syntaxes', async () => {
    const control = createStreamingControlParser()
    const handler = vi.fn()
    const dispose = control.onSignal(handler)

    await expect(control.dispatchWith('<|ACT:"emotion":{"name":"happy"}|>')).resolves.toBe(false)
    await expect(control.dispatchWith('<|DELAY:1|>')).resolves.toBe(false)
    expect(handler).not.toHaveBeenCalled()

    dispose()
  })

  /**
   * @example
   * const control = createStreamingControlParser({ parsers: [customParser] })
   * await expect(control.dispatchWith('<|CUSTOM|>')).resolves.toBe(true)
   */
  it('loads named parsers with match and pure parse', async () => {
    const control = createStreamingControlParser({
      parsers: [
        {
          name: 'CUSTOM',
          match: special => special === '<|CUSTOM|>',
          parse: () => ({
            type: 'call',
            name: 'plugin.action',
            payload: { value: 1 },
          }),
        },
      ],
    })
    const handler = vi.fn()
    const dispose = control.on({
      name: 'plugin.action',
      prompt: 'Run the plugin action when the model is ready.',
    }, handler)

    await expect(control.dispatchWith('<|CUSTOM|>', { intentId: 'intent-custom' })).resolves.toBe(true)
    expect(handler).toHaveBeenCalledWith(
      { value: 1 },
      expect.objectContaining({
        intentId: 'intent-custom',
      }),
    )

    dispose()
  })

  /**
   * @example
   * control.on({ name: 'plugin.action', prompt: 'Run it.', examples: ['<|CALL ["plugin.action"]|>'] }, handler)
   * expect(control.renderManifestPrompt()).toContain('<|CALL ["plugin.action"]|>')
   */
  it('renders registered CALL manifests as model instructions', () => {
    const control = createStreamingControlParser()
    const dispose = control.on({
      name: 'plugin.action',
      prompt: 'Run the plugin action when the model is ready.',
      examples: [
        '<|CALL ["plugin.action"]|>',
      ],
    }, vi.fn())

    expect(control.renderManifestPrompt()).toContain('Available streaming CALL tokens')
    expect(control.renderManifestPrompt()).toContain('plugin.action')
    expect(control.renderManifestPrompt()).toContain('Run the plugin action when the model is ready.')
    expect(control.renderManifestPrompt()).toContain('<|CALL ["plugin.action"]|>')
    expect(control.renderManifestPrompt()).toContain('Never write provider tool names inside <|CALL ...|>')

    dispose()
  })
})
