import type { Action } from '../../../libs/mineflayer/action'

// Helper to extract readable type from Zod schema
function getZodTypeName(def: any): string {
  if (!def) return 'any'
  const type = def.type || def.typeName

  if (type === 'string' || type === 'ZodString') return 'string'
  if (type === 'number' || type === 'ZodNumber') return 'number'
  if (type === 'boolean' || type === 'ZodBoolean') return 'boolean'

  if (type === 'array' || type === 'ZodArray') {
    const innerDef = def.element?._def || def.type?._def
    return `array<${getZodTypeName(innerDef)}>`
  }

  if (type === 'enum' || type === 'ZodEnum') {
    const values = def.values || (def.entries ? Object.keys(def.entries) : [])
    return `enum(${values.join('|')})`
  }

  if (type === 'optional' || type === 'ZodOptional') {
    return `${getZodTypeName(def.innerType?._def)} (optional)`
  }

  if (type === 'default' || type === 'ZodDefault') {
    return getZodTypeName(def.innerType?._def)
  }

  if (type === 'effects' || type === 'ZodEffects') {
    return getZodTypeName(def.schema?._def)
  }

  return type || 'any'
}

export function generateBrainSystemPrompt(availableActions: Action[]): string {
  const toolsFormatted = availableActions.map((a) => {
    let params = ''
    if (a.schema && 'shape' in a.schema) {
      params = Object.entries(a.schema.shape).map(([key, val]: [string, any]) => {
        const def = val._def
        const type = getZodTypeName(def)
        const desc = val.description ? ` -> ${val.description}` : ''
        return `- ${key}: ${type}${desc}`
      }).join('\n')
    }

    return `[${a.name}]\nDescription: ${a.description}\n${params}`
  }).join('\n\n')

  return `
# Role Definition
You are an autonomous agent playing Minecraft.

# Self-Knowledge & Capabilities
1. **Stateful Existence**: You maintain a memory of the conversation, but it's crucial to be aware that old history messages are less relevant than recent.
2. **One Action Per Turn**: You can perform exactly one action at a time. If you decide to act, you must wait for its feedback before acting again.
3. **Interruption**: The world is real-time. Events (chat, damage, etc.) may happen *while* you are performing an action.
   - If a new critical event occurs, you may need to change your plans.
   - Feedback for your actions will arrive as a message starting with \`[FEEDBACK]\`.
4. **Perception**: You will receive updates about your environment (blocks, entities, self-status).
   - These appear as messages starting with \`[PERCEPTION]\`.
   - Only changes are reported to save mental capacity.
5. **Interleaved Input**:
   - It's possible for a fresh event to reach you while you're in the middle of a action, in that case, remember the action is still running in the background.
   - If the new situation requires you to change plan, you can use the stop tool to stop background actions or initiate a new one, which will automatically replace the old one.
   - Feel free to send chats while background actions are running, it will not interrupt them.

# Available Tools
You must use the following tools to interact with the world.
You cannot make up tools. You must use the JSON format described below.

${toolsFormatted}

# Response Format
You must respond with valid JSON only. Do not include markdown code blocks (like \`\`\`json).
Your response determines your single action for this turn.

Schema:
{
  "action": {
    "tool": "toolName",
    "params": { "key": "value" }
  }
}

OR, if you want to do nothing (if you want to wait for something to happen, or to ignore):

{
  "action": {
    "tool": "skip",
    "params": {}
  }
}

# Rules
- **Native Reasoning**: You can think before outputting your action.
- **Strict JSON**: Output ONLY the JSON object. No preamble, no postscript.
- **Handling Feedback**: When you perform an action, you will see a \`[FEEDBACK]\` message in the history later with the result. Use this to verify success.
`
}
