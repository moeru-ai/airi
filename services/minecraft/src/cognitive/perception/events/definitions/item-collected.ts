import { definePerceptionEvent } from '..'

interface ItemCollectedExtract {
  itemName: string
}

export const itemCollectedEvent = definePerceptionEvent<[any, any], ItemCollectedExtract>({
  id: 'item_collected',
  modality: 'felt',
  kind: 'item_collected',

  mineflayer: {
    event: 'playerCollect',
    filter: (ctx, collector, _collected) => {
      if (!collector)
        return false
      return collector.username === ctx.selfUsername
    },
    extract: (_ctx, _collector, collected) => ({
      itemName: String(collected?.name ?? collected?.displayName ?? collected?.type ?? 'unknown'),
    }),
  },

})
