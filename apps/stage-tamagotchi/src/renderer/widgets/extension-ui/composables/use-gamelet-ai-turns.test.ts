import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ingest, getProviderInstance, consciousness } = vi.hoisted(() => ({
  ingest: vi.fn<(text: string, options: { model: string, chatProvider: unknown }) => Promise<void>>(async () => undefined),
  getProviderInstance: vi.fn(async () => ({ name: 'deepseek-stub' })),
  consciousness: { activeProvider: 'deepseek' as string, activeModel: 'deepseek-chat' as string },
}))

vi.mock('@proj-airi/stage-ui/stores/chat', () => ({
  useChatOrchestratorStore: () => ({ ingest }),
}))
vi.mock('@proj-airi/stage-ui/stores/providers', () => ({
  useProvidersStore: () => ({ getProviderInstance }),
}))
vi.mock('@proj-airi/stage-ui/stores/modules/consciousness', () => ({
  useConsciousnessStore: () => consciousness,
}))

const { useGameletAiTurns } = await import('./use-gamelet-ai-turns')

/** A well-formed `gamelet:ai-turn` request payload. */
function validRequest(): Record<string, unknown> {
  return {
    headline: 'Chess — blunder',
    instruction: 'Black just blundered a rook.',
    systemInstructions: ['Stay in character.', 'Keep it brief.'],
    fallbackText: '这步亏了一个车。',
  }
}

/** Lets the queued microtask + macrotask resolve so the async ingest flush settles. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * @example
 * useGameletAiTurns().handlePublish({ payload: { type: 'gamelet:ai-turn', request } })
 */
describe('useGameletAiTurns', () => {
  beforeEach(() => {
    ingest.mockReset()
    ingest.mockResolvedValue(undefined)
    getProviderInstance.mockReset()
    getProviderInstance.mockResolvedValue({ name: 'deepseek-stub' })
    consciousness.activeProvider = 'deepseek'
    consciousness.activeModel = 'deepseek-chat'
  })

  /**
   * @example
   * expect(ingest).toHaveBeenCalledTimes(1)
   */
  it('ingests a gamelet:ai-turn request as one chat orchestrator turn', async () => {
    ingest.mockClear()
    const { handlePublish } = useGameletAiTurns()

    handlePublish({ payload: { type: 'gamelet:ai-turn', request: validRequest() } })
    await flush()

    expect(ingest).toHaveBeenCalledTimes(1)
    const [messageText, options] = ingest.mock.calls[0]
    // The standing system instructions are prepended so they reach the model
    // every turn even when the persona omits them.
    expect(messageText).toContain('Stay in character.')
    expect(messageText).toContain('Black just blundered a rook.')
    expect(options.model).toBe('deepseek-chat')
    expect(options.chatProvider).toBeDefined()
  })

  /**
   * @example
   * expect(ingest).not.toHaveBeenCalled()
   */
  it('ignores publish events that are not gamelet:ai-turn requests', async () => {
    ingest.mockClear()
    const { handlePublish } = useGameletAiTurns()

    handlePublish({ payload: { type: 'something-else', request: validRequest() } })
    handlePublish({ payload: { requestId: 'r1', bestMove: 'e2e4' } })
    handlePublish({ unrelated: 'value' })
    await flush()

    expect(ingest).not.toHaveBeenCalled()
  })

  /**
   * @example
   * expect(ingest).not.toHaveBeenCalled()
   */
  it('rejects a malformed request rather than ingesting a partial turn', async () => {
    ingest.mockClear()
    const { handlePublish } = useGameletAiTurns()

    const malformed: Array<Record<string, unknown>> = [
      { headline: 'h' },
      { ...validRequest(), instruction: '   ' },
      { ...validRequest(), fallbackText: 42 },
      { ...validRequest(), systemInstructions: 'not-an-array' },
      { ...validRequest(), systemInstructions: ['ok', 7] },
    ]
    for (const request of malformed)
      handlePublish({ payload: { type: 'gamelet:ai-turn', request } })
    await flush()

    expect(ingest).not.toHaveBeenCalled()
  })

  /**
   * @example
   * expect(ingest).toHaveBeenCalledTimes(1)
   */
  it('drops a concurrent ai-turn while the first is still streaming', async () => {
    let release: () => void = () => {}
    const inFlight = new Promise<void>((resolve) => {
      release = resolve
    })
    ingest.mockImplementationOnce(() => inFlight)
    const { handlePublish } = useGameletAiTurns()

    handlePublish({ payload: { type: 'gamelet:ai-turn', request: validRequest() } })
    await flush()
    // Second event arrives while the first ingest is still streaming.
    handlePublish({ payload: { type: 'gamelet:ai-turn', request: validRequest() } })
    await flush()

    expect(ingest).toHaveBeenCalledTimes(1)

    release()
    await flush()
  })

  it('drops a concurrent ai-turn while the provider is still resolving', async () => {
    let releaseProvider: () => void = () => {}
    const provider = new Promise<{ name: string }>((resolve) => {
      releaseProvider = () => resolve({ name: 'slow-provider' })
    })
    getProviderInstance.mockImplementationOnce(() => provider)
    const { handlePublish } = useGameletAiTurns()

    handlePublish({ payload: { type: 'gamelet:ai-turn', request: validRequest() } })
    handlePublish({ payload: { type: 'gamelet:ai-turn', request: validRequest() } })
    await flush()

    expect(getProviderInstance).toHaveBeenCalledTimes(1)
    expect(ingest).not.toHaveBeenCalled()

    releaseProvider()
    await flush()
    expect(ingest).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * expect(ingest).not.toHaveBeenCalled()
   */
  it('drops the ai-turn when no active provider/model is configured', async () => {
    ingest.mockClear()
    const savedProvider = consciousness.activeProvider
    consciousness.activeProvider = ''
    try {
      const { handlePublish } = useGameletAiTurns()
      handlePublish({ payload: { type: 'gamelet:ai-turn', request: validRequest() } })
      await flush()
      expect(ingest).not.toHaveBeenCalled()
    }
    finally {
      consciousness.activeProvider = savedProvider
    }
  })
})
