import type { SystemMessage } from '@xsai/shared-chat'

import { EMOTION_EmotionMotionName_value, EMOTION_VALUES } from '../emotions'

function message(prefix: string, suffix: string) {
  return {
    content: [
      prefix,
      EMOTION_VALUES
        .map(emotion => `- ${emotion} (Emotion for feeling ${EMOTION_EmotionMotionName_value[emotion]})`)
        .join('\n'),
      suffix,
    ].join('\n\n'),
    role: 'system',
  } satisfies SystemMessage
}

export default message
