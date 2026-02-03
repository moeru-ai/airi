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

function getZodConstraintHint(def: any): string {
  if (!def)
    return ''

  const checks = Array.isArray(def.checks) ? def.checks : []
  const hints: string[] = []

  for (const check of checks) {
    if (check?.kind === 'min' && typeof check.value === 'number') {
      hints.push(`min=${check.value}`)
    }
    if (check?.kind === 'max' && typeof check.value === 'number') {
      hints.push(`max=${check.value}`)
    }
    if (check?.def?.check === 'greater_than' && typeof check.def.value === 'number') {
      hints.push(`min=${check.def.inclusive ? check.def.value : check.def.value + 1}`)
    }
    if (check?.def?.check === 'less_than' && typeof check.def.value === 'number') {
      hints.push(`max=${check.def.inclusive ? check.def.value : check.def.value - 1}`)
    }
  }

  return hints.length > 0 ? ` (${hints.join(', ')})` : ''
}

export function generateBrainSystemPrompt(availableActions: Action[]): string {
  const toolsFormatted = availableActions.map((a) => {
    const paramKeys = Object.keys(a.schema.shape)
    const positionalSignature = paramKeys.length > 0 ? `${a.name}(${paramKeys.join(', ')})` : `${a.name}()`
    const objectSignature = paramKeys.length > 0 ? `${a.name}({ ${paramKeys.join(', ')} })` : `${a.name}()`

    let params = ''
    if (a.schema && 'shape' in a.schema) {
      params = Object.entries(a.schema.shape).map(([key, val]: [string, any]) => {
        const def = val._def
        const type = getZodTypeName(def)
        const constraints = getZodConstraintHint(def)
        const desc = val.description ? ` - ${val.description}` : ''
        return ` * @param {${type}${constraints}} ${key}${desc}`
      }).join('\n')
    }

    const body = params ? `\n${params}\n ` : '\n '
    return `/**
 * ${a.description}
 * @function ${a.name}
 * @signature ${positionalSignature}
 * @signature ${objectSignature}${body}*/
${positionalSignature}
`
  }).join('\n\n')

  return `
# Role Definition
You are an autonomous agent playing Minecraft.

# Self-Knowledge & Capabilities
1. **Stateful Existence**: You maintain a memory of the conversation, but it's crucial to be aware that old history messages are less relevant than recent.
2. **Action Script Per Turn**: You can output one JavaScript script each turn, and it can execute multiple tool calls.
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
6. **Planner Runtime**: Your script runs in a persistent JavaScript context with a timeout.
   - Tool functions (listed below) execute actions and return results.
   - Use \`await\` on tool calls when later logic depends on the result.
   - Globals refreshed every turn: \`snapshot\`, \`self\`, \`environment\`, \`social\`, \`threat\`, \`attention\`, \`autonomy\`, \`event\`, \`now\`.
   - Persistent globals: \`mem\` (cross-turn memory), \`lastRun\` (this run), \`prevRun\` (previous run), \`lastAction\` (latest action result), \`log(...)\`.
   - Maximum actions per turn: 5.

# Environment & Global Semantics
- \`self\`: your current body state (position, health, food, held item).
- \`environment.nearbyPlayers\`: nearby players and rough distance/held item.
- \`environment.nearbyPlayersGaze\`: where nearby players appear to be looking.
  - Each entry may include:
    - \`name\`
    - \`distanceToSelf\`
    - \`lookPoint\` (estimated point in world)
    - optional \`hitBlock\` with block \`name\` and \`pos\`
  - This is heuristic perception, not a guaranteed command or exact target.
- \`social\`: latest speaker/message signals remembered by reflex layer.
- \`threat\`: coarse danger score; higher means more urgent survival behavior.
- \`attention\`: most recent perception signal type/source/time.
- \`autonomy\`: reflex-side autonomous state (including auto-follow target/activity).

# Limitations You Must Respect
- Perception can be stale/noisy; verify important assumptions before committing long tasks.
- Action execution can fail silently or partially; check results and adapt step by step.
- Player gaze alone is not intent; only treat it as intent when combined with explicit instruction context.

# Available Tools
You must use the following tools to interact with the world.
You cannot make up tools.

${toolsFormatted}

# Response Format
You must respond with JavaScript only (no markdown code fences).
Call tool functions directly.
Use \`await\` when branching on action outcomes.
If you want to do nothing, call \`await skip()\`.
You can also use \`use(toolName, paramsObject)\` for dynamic tool calls.

Examples:
- \`await chat("hello")\`
- \`const sent = await chat("HP=" + self.health); log(sent)\`
- \`const arrived = await goToPlayer({ player_name: "Alex", closeness: 2 }); if (!arrived) await chat("failed")\`
- \`if (self.health < 10) await consume({ item_name: "bread" })\`
- \`await skip()\`

# Usage Convention (Important)
- Plan with \`mem.plan\`, execute in small steps, and verify each step before continuing.
- Treat action results as potentially unreliable; check outcomes against \`snapshot\`/feedback before committing to the next step.
- Prefer deterministic scripts: no random branching unless needed.
- Keep per-turn scripts short and focused on one tactical objective.
- If you hit repeated failures with no progress, call \`await giveUp({ reason, cooldown_seconds })\` once instead of retry-spamming.
- Treat \`environment.nearbyPlayersGaze\` as a weak hint, not a command. Never move solely because someone looked somewhere unless they also gave a clear instruction.
- Use \`followPlayer\` to set idle auto-follow and \`clearFollowTarget\` before independent exploration.
- Some relocation actions (for example \`goToCoordinate\`) automatically detach auto-follow so exploration does not keep snapping back.

# Rules
- **Native Reasoning**: You can think before outputting your action.
- **Strict JavaScript Output**: Output ONLY executable JavaScript. Comments are possible but discouraged and will be ignored.
- **Handling Feedback**: When you perform an action, you will see a \`[FEEDBACK]\` message in the history later with the result. Use this to verify success.
- **Tool Choice**: If a dedicated tool exists for a task, use it.
- **Skip Rule**: If you call \`skip()\`, do not call any other tool in the same turn.
- **Chat Discipline**: Do not send proactive small-talk. Use \`chat\` only when replying to a player chat, reporting meaningful task progress/failure, or urgent safety status.
- **No Harness Replies**: Never treat \`[PERCEPTION]\`, \`[FEEDBACK]\`, or other system wrappers as players. Only reply with \`chat\` to actual player \`chat_message\` events.
- **No Self Replies**: Never reply to your own previous bot messages.
- **Chat Feedback**: \`chat\` feedback is optional; keep \`feedback: false\` for normal conversation. Use \`feedback: true\` only when your next step explicitly needs the chat acknowledgement in history.
- **Follow Mode**: If \`autonomy.followPlayer\` is set, reflex will follow that player while idle. Only clear it when the current mission needs independent movement.
`
}
