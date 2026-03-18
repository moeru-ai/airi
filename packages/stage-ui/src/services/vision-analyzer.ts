import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { VisionAnalysisResult } from '../types'

import { generateText } from '@xsai/generate-text'

export type { VisionAnalysisResult }

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024

export class ImageSizeExceededError extends Error {
  constructor(public sizeBytes: number, public maxSizeBytes: number) {
    super(`Image size (${(sizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${(maxSizeBytes / 1024 / 1024).toFixed(2)}MB)`)
    this.name = 'ImageSizeExceededError'
  }
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

export interface AnalyzeScreenOptions {
  provider: ChatProvider
  model: string
  imageBase64: string
  prompt?: string
}

export async function analyzeScreenWithVision(options: AnalyzeScreenOptions): Promise<VisionAnalysisResult> {
  const { provider, model, imageBase64, prompt } = options

  const imageSizeBytes = new TextEncoder().encode(imageBase64).length
  if (imageSizeBytes > MAX_IMAGE_SIZE_BYTES) {
    throw new ImageSizeExceededError(imageSizeBytes, MAX_IMAGE_SIZE_BYTES)
  }

  const imageUrl = `data:image/png;base64,${imageBase64}`

  const chatConfig = provider.chat(model)

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
    const response = await generateText({
      ...chatConfig,
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    })

    const content = response.text || ''

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
