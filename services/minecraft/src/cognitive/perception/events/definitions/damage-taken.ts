import { definePerceptionEvent } from '..'

interface DamageTakenExtract {
  amount: number
}

let lastHealth: number | null = null

let pendingDamageAmount: number | null = null

export const damageTakenEvent = definePerceptionEvent<[], DamageTakenExtract>({
  id: 'damage_taken',
  modality: 'felt',
  kind: 'damage_taken',

  mineflayer: {
    event: 'health',
    filter: (ctx) => {
      const current = ctx.bot.health
      const prev = lastHealth
      lastHealth = current

      if (typeof prev !== 'number') {
        pendingDamageAmount = null
        return false
      }

      const amount = prev - current
      if (amount <= 0) {
        pendingDamageAmount = null
        return false
      }

      pendingDamageAmount = amount
      return true
    },
    extract: (ctx) => {
      const current = ctx.bot.health
      const prev = lastHealth ?? current
      return {
        amount: pendingDamageAmount ?? Math.max(0, prev - current),
      }
    },
  },

  saliency: {
    threshold: 1,
    key: 'felt:damage',
  },

  signal: {
    type: 'saliency_high',
    description: () => 'Taken damage!',
    metadata: extracted => ({
      kind: 'felt',
      action: 'damage',
      amount: extracted.amount,
    }),
  },

  routes: ['conscious', 'reflex', 'debug'],
})
