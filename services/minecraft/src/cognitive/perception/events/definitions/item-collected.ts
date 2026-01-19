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

  saliency: {
    threshold: 3,
    key: 'felt:pickup',
  },

  signal: {
    type: 'entity_attention',
    description: () => 'Picked up an item',
    metadata: extracted => ({
      kind: 'felt',
      action: 'pickup',
      itemName: extracted.itemName,
    }),
  },

  routes: ['conscious', 'debug'],
})

// TODO: find out if this is needed. Some servers might use entityCollect instead of playerCollect?
// export const itemCollectedEntityCollectEvent = definePerceptionEvent<[any, any], ItemCollectedExtract>({
//   id: 'item_collected_entity_collect',
//   modality: 'felt',
//   kind: 'item_collected',

//   mineflayer: {
//     event: 'entityCollect',
//     filter: (ctx, collector, _collected) => {
//       if (!collector)
//         return false
//       return collector.username === ctx.selfUsername
//     },
//     extract: (_ctx, _collector, collected) => ({
//       itemName: String(collected?.name ?? collected?.displayName ?? collected?.type ?? 'unknown'),
//     }),
//   },

//   saliency: {
//     threshold: 3,
//     key: 'felt:pickup',
//   },

//   signal: {
//     type: 'entity_attention',
//     description: () => 'Picked up an item',
//     metadata: extracted => ({
//       kind: 'felt',
//       action: 'pickup',
//       itemName: extracted.itemName,
//     }),
//   },

//   routes: ['conscious', 'debug'],
// })
