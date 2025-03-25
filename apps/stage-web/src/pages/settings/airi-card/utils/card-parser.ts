import type { Card } from '@moeru-ai/ccc'
import type { CharacterCardV2 } from '@proj-airi/stage-ui/stores'

/**
 * Reads the content of a file as text
 */
export function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string)
      }
      else {
        reject(new Error('Failed to read file'))
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsText(file)
  })
}

/**
 * Parses card data from various formats
 */
export function parseCardData(content: string): Omit<Card, 'id'> | null {
  try {
    const jsonData = JSON.parse(content)

    // Check if it's a character card v2 format
    if (jsonData.spec === 'chara_card_v2' && jsonData.data) {
      return parseCharaCardV2(jsonData)
    }

    // Handle simple format
    return parseSimpleCard(jsonData)
  }
  catch (error) {
    console.error('Failed to parse JSON:', error)
    throw new Error('Invalid character card format')
  }
}

/**
 * Parses a character card in v2 format
 */
function parseCharaCardV2(jsonData: CharacterCardV2): Omit<Card, 'id'> {
  const { data } = jsonData

  if (!data.name) {
    throw new Error('Missing required field: name')
  }

  const combinedDescription = buildCombinedDescription(data)
  const systemPrompt = data.system_prompt || ''

  // Save original data to extensions field
  const extensions = {
    personality: data.personality || '',
    scenario: data.scenario || '',
    first_mes: data.first_mes || '',
    creator_notes: data.creator_notes || '',
    post_history_instructions: data.post_history_instructions || '',
    character_book: data.character_book || null,
    alternate_greetings: data.alternate_greetings || [],
  }

  return {
    name: data.name,
    description: combinedDescription,
    version: data.character_version || jsonData.spec_version || '1.0.0',
    prompt: systemPrompt || data.first_mes || '',
    tags: data.tags || [],
    extensions,
  } as Omit<Card, 'id'>
}

/**
 * Builds a combined description from character data
 */
function buildCombinedDescription(data: CharacterCardV2['data']): string {
  let combinedDescription = data.description || ''
  const personalityText = data.personality || ''

  if (personalityText) {
    combinedDescription += `\n\n**Personality:**\n${personalityText}`
  }

  if (data.scenario) {
    combinedDescription += `\n\n**Scenario:**\n${data.scenario}`
  }

  return combinedDescription
}

/**
 * Parses a simple card format
 */
function parseSimpleCard(jsonData: any): Omit<Card, 'id'> {
  if (!jsonData.name) {
    throw new Error('Missing required field: name')
  }

  return {
    name: jsonData.name,
    description: jsonData.description || '',
    version: jsonData.version || '1.0.0',
    prompt: jsonData.prompt || jsonData.system_prompt || '',
    tags: jsonData.tags || [],
  } as Omit<Card, 'id'>
}

/**
 * Highlights placeholders in text
 */
export function highlightPlaceholders(text: string): string {
  if (!text || typeof text !== 'string')
    return ''

  return text.replace(/\{\{([^{}]*)\}\}/g, (match, name) => {
    return `<span class="inline-block bg-gradient-to-r from-primary-500/20 to-primary-500/10 text-primary-500 px-1 rounded font-bold">{{ ${name.trim()} }}</span>`
  })
}
