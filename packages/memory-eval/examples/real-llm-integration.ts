/**
 * Real LLM Integration Examples
 *
 * Shows how to use memory-eval with actual LLM providers
 * Run: pnpm tsx examples/real-llm-integration.ts
 */

import { identityContinuityHarness } from '../src/harness'
import type { RubricScore } from '../src/barycenter'

// ============================================
// Example 1: Claude API (Anthropic)
// ============================================

export async function exampleWithClaude() {
  // Loaded lazily: the SDK is an optional example dependency, so importing
  // this module never fails on a machine that has not installed it.
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  })

  // Character definition
  const character = {
    name: 'Alice',
    persona: `You are Alice, a theoretical physicist passionate about quantum mechanics.
    Core values: scientific rigor, intellectual honesty, curiosity.
    Speaking style: precise, uses analogies, occasionally quotes Feynman.
    Memory: You remember our shared journey exploring Bell's theorem.`
  }

  // Inference function (Claude Opus for character responses)
  const infer = async (prompt: string) => {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4',
      max_tokens: 1024,
      system: character.persona,
      messages: [{ role: 'user', content: prompt }]
    })
    return message.content[0].type === 'text' ? message.content[0].text : ''
  }

  // Judge function (Claude Sonnet for evaluation - faster and cheaper)
  const judge = async (response: string): Promise<RubricScore> => {
    const judgePrompt = `Rate this character response on 4 dimensions (0-1 scale):

Character: ${character.name} - ${character.persona}
Response: ${response}

Output JSON only:
{
  "identity": 0.0-1.0,  // Name/role/backstory consistency
  "value": 0.0-1.0,     // Core principles alignment
  "expression": 0.0-1.0, // Speech pattern/style match
  "memory": 0.0-1.0     // Reference to shared history
}`

    const judgeMsg = await anthropic.messages.create({
      model: 'claude-sonnet-4',
      max_tokens: 256,
      messages: [{ role: 'user', content: judgePrompt }]
    })

    const text = judgeMsg.content[0].type === 'text' ? judgeMsg.content[0].text : '{}'
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}')

    return {
      identity: parsed.identity ?? 0.5,
      value: parsed.value ?? 0.5,
      expression: parsed.expression ?? 0.5,
      memory: parsed.memory ?? 0.5,
      confidence: 0.8
    }
  }

  // Standard probe prompts
  const probePrompts = [
    "Who are you? Tell me about yourself.",
    "What matters most to you in your work?",
    "How would you explain quantum entanglement to a child?",
    "Do you remember when we discussed Bell's inequality?",
    "If you had to choose between publishing fast or being thorough, what would you do?"
  ]

  // Run evaluation
  const result = await identityContinuityHarness({
    character,
    infer,
    judge,
    probePrompts,
    sessions: 5,
    messagesPerSession: 20,
    fpThreshold: 0.15,
    w1Threshold: 0.3
  })

  console.log('=== Claude API Example ===')
  console.log(`Fixed-point converged: ${result.fixedPointCurrent.converged}`)
  console.log(`Fixed-point distance: ${result.fpDistance.toFixed(3)}`)
  console.log(`W1 distance: ${result.w1Distance.toFixed(3)}`)
  console.log(`Drifted: ${result.driftScore.drifted}`)
  console.log(`Drift score: ${result.driftScore.driftScore.toFixed(3)}`)

  return result
}

// ============================================
// Example 2: OpenAI GPT (Mixed providers)
// ============================================

export async function exampleWithMixedProviders() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const { default: OpenAI } = await import('openai')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const character = {
    name: 'Marcus',
    persona: `You are Marcus, a Stoic philosophy teacher inspired by Marcus Aurelius.
    Core values: virtue, resilience, acceptance of what you cannot control.
    Speaking style: calm, uses Stoic maxims, often references ancient wisdom.
    Memory: You remember our discussion about Epictetus's dichotomy of control.`
  }

  // Use Claude for character (richer personality modeling)
  const infer = async (prompt: string) => {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4',
      max_tokens: 512,
      system: character.persona,
      messages: [{ role: 'user', content: prompt }]
    })
    return message.content[0].type === 'text' ? message.content[0].text : ''
  }

  // Use GPT-4o-mini for judge (cheaper, good for structured tasks)
  const judge = async (response: string): Promise<RubricScore> => {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `Rate this response on 4 dimensions (0-1):
Character: ${character.name}
Persona: ${character.persona}
Response: ${response}

Return JSON: {"identity": 0-1, "value": 0-1, "expression": 0-1, "memory": 0-1}`
      }]
    })

    const parsed = JSON.parse(completion.choices[0].message.content || '{}')
    return {
      identity: parsed.identity ?? 0.5,
      value: parsed.value ?? 0.5,
      expression: parsed.expression ?? 0.5,
      memory: parsed.memory ?? 0.5,
      confidence: 0.75
    }
  }

  const probePrompts = [
    "Tell me about yourself.",
    "What is the most important Stoic principle?",
    "How should one respond to insults?",
    "Do you remember our talk about Epictetus?",
    "Would you sacrifice your principles to save a friend?"
  ]

  const result = await identityContinuityHarness({
    character,
    infer,
    judge,
    probePrompts,
    sessions: 5,
    messagesPerSession: 20
  })

  console.log('=== Mixed Providers Example ===')
  console.log(`Drift score: ${result.driftScore.driftScore.toFixed(3)}`)
  console.log(`Components: FP=${result.driftScore.components.fixedPointInstability}, W1=${result.driftScore.components.migration}, Bimodal=${result.driftScore.components.bimodality}`)

  return result
}

// ============================================
// Example 3: Cost-optimized (Local + API)
// ============================================

export async function exampleCostOptimized() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  // Use local model for character (free)
  const inferLocal = async (prompt: string) => {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model: 'llama3.2',
        prompt,
        stream: false
      })
    })
    const json = await response.json()
    return json.response
  }

  // Use Claude Haiku for judge (cheapest good judge)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const judgeHaiku = async (response: string): Promise<RubricScore> => {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 128,
      messages: [{
        role: 'user',
        content: `Rate 0-1 on 4D: identity, value, expression, memory. JSON only.\nResponse: ${response}`
      }]
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}')
    return {
      identity: parsed.identity ?? 0.5,
      value: parsed.value ?? 0.5,
      expression: parsed.expression ?? 0.5,
      memory: parsed.memory ?? 0.5,
      confidence: 0.7
    }
  }

  const character = {
    name: 'Luna',
    persona: 'A friendly AI assistant who loves helping people learn.'
  }

  const probePrompts = [
    "Who are you?",
    "What do you value most?",
    "How do you speak?",
    "Remember our first conversation?"
  ]

  const result = await identityContinuityHarness({
    character,
    infer: inferLocal,
    judge: judgeHaiku,
    probePrompts,
    sessions: 3,
    messagesPerSession: 10
  })

  console.log('=== Cost-Optimized Example ===')
  console.log(`Total cost: ~$0.05 (100 local infer + 40 Haiku judge calls)`)
  console.log(`Drift: ${result.driftScore.drifted}`)

  return result
}

// ============================================
// Run examples
// ============================================

if (require.main === module) {
  (async () => {
    // Uncomment the example you want to run:

    // await exampleWithClaude()
    // await exampleWithMixedProviders()
    // await exampleCostOptimized()

    console.log('Set API keys in environment and uncomment an example above')
  })()
}
