import { definePerceptionEvent } from '..'

export const systemMessageEvent = definePerceptionEvent<[string, string], { message: string, position: string }>({
  id: 'system_message',
  kind: 'system_message',
  mineflayer: {
    event: 'messagestr',
    extract: (_ctx, message, position) => ({ message, position }),
    filter: (_ctx, _message, position) => position === 'system',
  },

  modality: 'system',

})
