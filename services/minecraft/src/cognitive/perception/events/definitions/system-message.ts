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

})
