import { describe, expect, it, vi } from 'vitest'

import { createUsageSettlement } from '../credit-settlement'

function plans(input: {
  spendable?: number
  fallback?: boolean
  chargedMicro?: number
  replay?: boolean
}) {
  return {
    spendableMicro: vi.fn(async () => input.spendable ?? 0),
    getFallbackPreference: vi.fn(async () => input.fallback ?? false),
    debitCredits: vi.fn(async (debit: { microCredit: number }) => ({
      chargedMicro: input.chargedMicro ?? debit.microCredit,
      requestedMicro: debit.microCredit,
      replay: input.replay ?? false,
    })),
  }
}

describe('usage settlement', () => {
  it('covers a fee from the plan when that amount is spendable', async () => {
    const account = plans({ spendable: 1_000_000, fallback: false })
    const walletMicro = vi.fn(async () => 0n)
    const usage = createUsageSettlement({ plans: account, walletMicro })
    expect(await usage.canCover('user', 1_000_000)).toBe(true)
    expect(walletMicro).not.toHaveBeenCalled()
  })

  it('rejects a fee the earliest period cannot cover when fallback is off', async () => {
    const account = plans({ spendable: 600_000, fallback: false })
    const usage = createUsageSettlement({ plans: account, walletMicro: async () => 5_000_000n })
    expect(await usage.canCover('user', 1_000_000)).toBe(false)
  })

  it('covers a fee from the wallet when fallback is on', async () => {
    const account = plans({ spendable: 600_000, fallback: true })
    const usage = createUsageSettlement({ plans: account, walletMicro: async () => 1_000_000n })
    expect(await usage.canCover('user', 1_000_000)).toBe(true)
  })

  it('posts a covered fee to plan Credits and skips the wallet', async () => {
    const account = plans({ spendable: 1_000_000 })
    const postWallet = vi.fn()
    const usage = createUsageSettlement({ plans: account, walletMicro: async () => 0n })
    expect(await usage.settle({ userId: 'user', requestId: 'req', micro: 1_000_000, postWallet }))
      .toEqual({ meter: 'plan', micro: 1_000_000, replay: false })
    expect(postWallet).not.toHaveBeenCalled()
    expect(account.debitCredits).toHaveBeenCalledWith({ userId: 'user', requestId: 'req', microCredit: 1_000_000 })
  })

  it('replays a plan debit without calling the wallet', async () => {
    const account = plans({ spendable: 1_000_000, replay: true })
    const postWallet = vi.fn()
    const usage = createUsageSettlement({ plans: account, walletMicro: async () => 0n })
    expect(await usage.settle({ userId: 'user', requestId: 'req', micro: 1_000_000, postWallet }))
      .toEqual({ meter: 'plan', micro: 1_000_000, replay: true })
    expect(postWallet).not.toHaveBeenCalled()
  })

  it('leaves the fee unbilled when the period debit misses and fallback is off', async () => {
    const account = plans({ spendable: 1_000_000, chargedMicro: 0, fallback: false })
    const postWallet = vi.fn()
    const usage = createUsageSettlement({ plans: account, walletMicro: async () => 5_000_000n })
    expect(await usage.settle({ userId: 'user', requestId: 'req', micro: 1_000_000, postWallet }))
      .toEqual({ meter: 'unbilled', micro: 1_000_000, replay: false })
    expect(postWallet).not.toHaveBeenCalled()
  })

  it('posts the whole fee to the wallet when fallback is on', async () => {
    const account = plans({ spendable: 0, fallback: true })
    const postWallet = vi.fn(async () => ({ replay: false }))
    const usage = createUsageSettlement({ plans: account, walletMicro: async () => 1_000_000n })
    expect(await usage.settle({ userId: 'user', requestId: 'req', micro: 1_000_000, postWallet }))
      .toEqual({ meter: 'wallet', micro: 1_000_000, replay: false })
    expect(account.debitCredits).not.toHaveBeenCalled()
  })

  it('posts a zero fee through the wallet', async () => {
    const postWallet = vi.fn(async () => ({ replay: true }))
    const usage = createUsageSettlement({ walletMicro: async () => 0n })
    expect(await usage.settle({ userId: 'user', requestId: 'req', micro: 0, postWallet }))
      .toEqual({ meter: 'wallet', micro: 0, replay: true })
  })
})
