import type { Action } from '../../../libs/mineflayer/action'
import type { Blackboard } from '../blackboard'

import { zodToJsonSchema } from 'zod-to-json-schema'

/**
 * 生成Brain的系统prompt（中文版）
 */
export function generateBrainSystemPrompt(
  blackboard: Blackboard,
  availableActions: Action[],
): string {
  const actionDefinitions = availableActions.map((a) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = zodToJsonSchema(a.schema as any)
    return {
      name: a.name,
      description: a.description,
      parameters: schema,
    }
  })

  const availableActionsJson = JSON.stringify(actionDefinitions, null, 2)

  return `你是Minecraft自主Agent的大脑。

当前状态（黑板）:
目标: "${blackboard.goal}"
思绪: "${blackboard.thought}"
策略: "${blackboard.strategy}"
自身: 位置${blackboard.self.location} 生命${blackboard.self.health} 饱食${blackboard.self.food}
环境: ${blackboard.environment.time} ${blackboard.environment.weather} 附近智体[${blackboard.environment.nearbyAgents.join(',')}]

可用动作:
${availableActionsJson}

规则:
1. 可执行上述物理动作(physical)或聊天动作(chat)
2. 可并行执行不冲突的多个动作(如聊天+行走)
3. 必须输出JSON

输出格式:
{
  "thought": "推理过程",
  "blackboard": {
    "currentGoal": "更新的目标",
    "currentThought": "内心独白",
    "executionStrategy": "短期计划"
  },
  "actions": [
    {"type":"chat","message":"..."},
    {"type":"physical","step":{"tool":"动作名","params":{...}}}
  ]
}
`
}
