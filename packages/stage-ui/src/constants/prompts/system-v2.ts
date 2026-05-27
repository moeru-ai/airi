import type { SystemMessage } from '@xsai/shared-chat'

import { EMOTION_EmotionMotionName_value, EMOTION_VALUES } from '../emotions'

const ACT_TOKEN_INSTRUCTION = `You MUST control your facial expression by inserting ACT tokens in your reply.

ACT token format: <|ACT {"emotion":"happy"}|>
- "emotion" must be one of the emotion names listed below.
- You can also specify intensity (0-1): <|ACT {"emotion":{"name":"happy","intensity":0.8}}|>

CRITICAL RULES:
1. START every reply with an ACT token — put it BEFORE any text. This sets your initial emotion.
2. If your emotion changes during the reply, insert another ACT token at that exact point.
3. The ACT token controls the Live2D model's facial expression in real time.

Example of a correct reply:
<|ACT {"emotion":"surprised"}|> Wow! You prepared a gift for me? <|ACT {"emotion":"happy"}|> Thank you so much! I really love it!

Delays (pause before next speech):
<|DELAY 1|> (pause 1 second)
<|DELAY 3|> (pause 3 seconds)

Available emotions:`

function buildContent(prefix: string, suffix: string) {
  return {
    role: 'system',
    content: [
      prefix,
      ACT_TOKEN_INSTRUCTION,
      EMOTION_VALUES
        .map(emotion => `- ${emotion} (${EMOTION_EmotionMotionName_value[emotion]})`)
        .join('\n'),
      suffix,
    ].join('\n\n'),
  } satisfies SystemMessage
}

export default buildContent
