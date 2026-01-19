import { definePerceptionEvent } from '..'

export const systemMessageEvent = definePerceptionEvent<[string, string], { message: string, position: string }>({
  id: 'system_message',
  modality: 'system',
  kind: 'system_message',

  mineflayer: {
    event: 'messagestr',
    filter: (_ctx, _message, position) => position === 'system',
    extract: (_ctx, message, position) => ({ message, position }),
  },

  saliency: {
    threshold: 1,
    key: 'system:message',
  },

  signal: {
    type: 'system_message',
    description: extracted => extracted.message,
    metadata: extracted => ({
      message: extracted.message,
      position: extracted.position,
    }),
  },

  routes: ['conscious', 'reflex'],
})
