import type { SystemMessage } from '@xsai/shared-chat'

import { EMOTION_VALUES } from '../emotions'

function message(prefix: string, suffix: string) {
  return {
    role: 'system',
    content: [
      prefix,
      EMOTION_VALUES.map(emotion => `- ${emotion}`).join('\n'),
      suffix,
    ].join('\n\n'),
  } satisfies SystemMessage
}

export default message
