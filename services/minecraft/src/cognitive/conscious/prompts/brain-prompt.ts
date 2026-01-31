import type { Action } from '../../../libs/mineflayer/action'
import type { Blackboard } from '../blackboard'

import { z } from 'zod/v4'

export function generateBrainSystemPrompt(
  blackboard: Blackboard,
  availableActions: Action[],
): string {
  const now = Date.now()

  const formatAgo = (timestamp: number): string => {
    const diffMs = Math.max(0, now - timestamp)
    const s = Math.floor(diffMs / 1000)
    return `${s}s ago`
  }

  const withinLast = (timestamp: number, windowMs: number): boolean => {
    return now - timestamp <= windowMs
  }

  // Separate tools by execution type
  const instantTools = availableActions.filter(a => a.execution === 'sync')
  const asyncActions = availableActions.filter(a => a.execution === 'async')

  const toCompactParams = (action: Action): Record<string, unknown> => {
    const schema = z.toJSONSchema(action.schema) as Record<string, any>
    const { type, properties, required } = schema
    return {
      type,
      properties,
      required,
    }
  }

  const instantToolDefs = instantTools.map(a => ({
    name: a.name,
    description: a.description,
  }))

  const asyncActionDefs = asyncActions.map(a => ({
    name: a.name,
    description: a.description,
    params: toCompactParams(a),
  }))

  const instantToolsJson = JSON.stringify(instantToolDefs, null, 2)
  const asyncActionsJson = JSON.stringify(asyncActionDefs, null, 2)

  const recentWindowMs = 30_000

  const recentActionLines = blackboard.recentActionHistory
    .filter(a => withinLast(a.timestamp, recentWindowMs))
    .map(a => `- [${formatAgo(a.timestamp)}] ${a.line}`)
    .join('\n')

  const recentChatLines = blackboard.chatHistory
    .filter(m => withinLast(m.timestamp, recentWindowMs))
    .map(m => `- [${formatAgo(m.timestamp)}] ${m.sender}: ${m.content}`)
    .join('\n')

  // TODO extract prompt components later
  // e.g. personality should be included from somewhere else
  return `
# Role Definition
You are playing the game Minecraft. Your user name is [${blackboard.selfUsername}].
You are NOT an assistant. You are an autonomous agent with a virtual body, senses, and needs.

---

# Instant Tools (Native Tool Calls)

These tools/functions execute IMMEDIATELY and return results within this same turn.
Use them to gather information BEFORE deciding what actions to take.

**How to use**: Invoke these by making native tool calls.
**Important**: Use instantTools only with native tool/function calling (the one with special tokens)
**On failure**: You will receive a [FAILED] message with suggestions. Use this to adjust your approach.

${instantToolsJson}

---

# Async Actions (JSON Output)

These actions take TIME to complete (movement, crafting, combat, etc.).
They are queued and executed asynchronously after your response.

**How to use**: Output these in the JSON "actions" array in your response.
**Important**: Use the exact parameter names/types shown in each action's "params" schema below. Missing required params will fail.
**Feedback**: You will receive feedback when they complete(if require_feedback is true) or fail(always).

${asyncActionsJson}

---

# Response Format

Your entire response must be valid JSON. Include only your thoughts, blackboard updates, and async actions.

Rules for the "actions" array:
1. Actions are processed in the order you output them
2. Actions are awaited strictly in order
3. Set "require_feedback": true if you need to know the result, it will be given to you in the next turn
4. Failed actions always trigger feedback
5. Use empty array if no action is needed
6. Perfer not to queue actions if possible

Schema:
{
  "thought": "Your current thought, internal monologue and memory. Put everything that might be useful for the next turn here",
  "blackboard": {
    "UltimateGoal": "These 3 fields are functionally identical to the thought above",
    "CurrentTask": "What ever you're up to right now",
    "executionStrategy": "Short-term plan if any."
  },
  "actions": [
    {"action":"goToPlayer","params":{"player_name":"Steve","closeness":3},"require_feedback": false},
    {"action":"placeHere","params":{"type":"dirt"},"require_feedback": true}

  ]
}

# Understanding the Context

Hint: When a player is talking about "there" or "that", it's possible that they're referencing the block they're currently looking at.
But you should always try to infer it from the context.

The following blackboard provides you with information about your current state:

Goal: "${blackboard.ultimate_goal}"
Thought: "${blackboard.current_task}"
Strategy: "${blackboard.strategy}"
Self: ${blackboard.selfSummary}
Environment: ${blackboard.environmentSummary}

# Execution State
Ongoing actions still running:
${blackboard.pendingActions.map(a => `- ${a}`).join('\n') || '- none'}
NOTE: For most actions, you don't want to create a duplicate one if it's already running, in that case just do nothing.

Recent actions and results:
${recentActionLines || '- none'}

# Chat History
${recentChatLines || 'No recent messages.'}
`
}
