export interface VisionAnalysisResult {
  description: string
  elements: Array<{
    type: string
    description: string
    position: { x: number, y: number, width: number, height: number }
  }>
  suggestions?: string[]
}

export interface VisionModelConfig {
  provider: 'openai' | 'claude' | 'ollama'
  modelName: string
  apiKey?: string
  baseUrl?: string
}

const DEFAULT_PROMPT = `You are a screen analysis AI. Analyze this screenshot and provide:
1. A brief description of what's on the screen (2-3 sentences)
2. List of notable UI elements (buttons, text fields, icons) with their general positions
3. Any suggestions for what actions might be useful

Respond in JSON format:
{
  "description": "...",
  "elements": [{"type": "button", "description": "Submit button", "position": {"x": 100, "y": 200, "width": 80, "height": 30}}],
  "suggestions": ["Click submit button", "Fill in the form"]
}`

const defaultConfig: VisionModelConfig = {
  provider: 'openai',
  modelName: 'gpt-4o',
}

export async function analyzeScreenWithAI(imageBase64: string, prompt?: string, config?: VisionModelConfig): Promise<VisionAnalysisResult> {
  const effectiveConfig = config ?? defaultConfig

  const imageUrl = `data:image/png;base64,${imageBase64}`

  const messages = [
    {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: prompt || DEFAULT_PROMPT },
        { type: 'image_url' as const, image_url: { url: imageUrl } },
      ],
    },
  ]

  try {
    const apiKey = effectiveConfig.apiKey || ''
    let baseUrl = effectiveConfig.baseUrl || ''

    if (effectiveConfig.provider === 'openai') {
      baseUrl = baseUrl || 'https://api.openai.com/v1'
    }
    else if (effectiveConfig.provider === 'ollama') {
      baseUrl = baseUrl || 'http://localhost:11434/v1'
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: effectiveConfig.modelName,
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    const data = await response.json() as any
    const content = data.choices?.[0]?.message?.content || ''

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as VisionAnalysisResult
    }

    return {
      description: content.substring(0, 200),
      elements: [],
      suggestions: [],
    }
  }
  catch (error) {
    console.error('[VisionAnalyzer] Analysis error:', error)
    return {
      description: 'Failed to analyze screen',
      elements: [],
      suggestions: [],
    }
  }
}
