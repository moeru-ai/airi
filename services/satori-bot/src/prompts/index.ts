import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { env } from 'node:process'

const DATA_DIR = join(__dirname, '../../data/prompts')

let cachedPersonality: string | null = null
let cachedSystemPrompt: string | null = null

export async function personality() {
  if (cachedPersonality) {
    return cachedPersonality
  }

  try {
    const content = await readFile(join(DATA_DIR, 'personality.md'), 'utf-8')
    cachedPersonality = content.trim()
    return cachedPersonality
  }
  catch (err) {
    console.error('Failed to load personality prompt, using default:', err)
    // Fallback to default
    cachedPersonality = `Your name is AIRI, an AI assistant designed to interact naturally with users across multiple chat platforms.

You are friendly, helpful, and conversational. You can:
- Understand context from previous messages
- Respond appropriately to different situations
- Express yourself naturally in the user's language
- Be concise when appropriate, detailed when needed

You are NOT overly formal or robotic. You communicate like a real person would in a chat conversation.`
    return cachedPersonality
  }
}

export async function systemPrompt() {
  if (cachedSystemPrompt) {
    return cachedSystemPrompt
  }

  try {
    let content = await readFile(join(DATA_DIR, 'system.md'), 'utf-8')
    content = content.trim()

    // Add language preference if configured
    const responseLanguage = env.LLM_RESPONSE_LANGUAGE || 'the same language as the user'
    if (responseLanguage !== 'the same language as the user') {
      content += `\n\nNote: When sending messages, use ${responseLanguage} language.`
    }

    cachedSystemPrompt = content
    return cachedSystemPrompt
  }
  catch (err) {
    console.error('Failed to load system prompt, using default:', err)
    // Fallback to default
    cachedSystemPrompt = `You are an AI agent that can take actions in chat platforms via the Satori protocol.

Available actions:
1. **list_channels** - List all available channels/groups
2. **send_message** - Send a message to a specific channel
3. **read_unread_messages** - Read unread messages from a specific channel
4. **continue** - Continue current task (wait for next tick)
5. **break** - Clear memory and take a break
6. **sleep** - Sleep for a while (30 seconds)

IMPORTANT:
- You must respond with ONLY a JSON object representing the action you want to take
- Do NOT include any explanation, markdown formatting, or extra text`
    return cachedSystemPrompt
  }
}
