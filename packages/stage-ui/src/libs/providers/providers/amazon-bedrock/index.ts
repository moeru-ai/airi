import type { ModelInfo } from '../../types'

import { createModelProvider, merge } from '@xsai-ext/providers/utils'
import { z } from 'zod'

import { defineProvider } from '../registry'

const amazonBedrockConfigSchema = z.object({
  apiKey: z
    .string('Amazon Bedrock API Key')
    .min(1),
  region: z
    .string('AWS Region')
    .regex(/^[a-z]{2,3}-[a-z]+-\d+$/, 'Must be a valid AWS region (e.g. us-east-1, ap-southeast-1)')
    .optional()
    .default('us-east-1'),
})

type AmazonBedrockConfig = z.infer<typeof amazonBedrockConfigSchema>

// Helper: merge consecutive messages with the same role (Converse API requires alternating)
function mergeConsecutiveRoles(messages: Array<{ role: string, content: any[] }>) {
  const merged: Array<{ role: string, content: any[] }> = []
  for (const msg of messages) {
    const last = merged.at(-1)
    if (last && last.role === msg.role) {
      last.content.push(...msg.content)
    }
    else {
      merged.push({ role: msg.role, content: [...msg.content] })
    }
  }
  return merged
}

// Helper: convert xsai message content to Converse content blocks
function toConverseContent(content: any): Array<{ text: string }> {
  if (typeof content === 'string') {
    return [{ text: content }]
  }
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === 'text' && c.text)
      .map((c: any) => ({ text: c.text }))
  }
  return [{ text: String(content) }]
}

// Fallback static model list when API is unavailable
function fallbackModels(): ModelInfo[] {
  return [
    { id: 'us.amazon.nova-pro-v1:0', name: 'Amazon Nova Pro', provider: 'amazon-bedrock', description: 'Amazon Nova highly capable multimodal model' },
    { id: 'us.amazon.nova-lite-v1:0', name: 'Amazon Nova Lite', provider: 'amazon-bedrock', description: 'Amazon Nova very low cost multimodal model' },
    { id: 'us.amazon.nova-micro-v1:0', name: 'Amazon Nova Micro', provider: 'amazon-bedrock', description: 'Amazon Nova text only model, lowest cost' },
    { id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude Sonnet 3.5 v2', provider: 'amazon-bedrock', description: 'Intelligent, fast Claude 3.5 model on Amazon Bedrock' },
    { id: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0', name: 'Claude Sonnet 3.7', provider: 'amazon-bedrock', description: 'Hybrid reasoning model on Amazon Bedrock' },
  ]
}

function createBedrockConverseProvider(config: {
  apiKey: string
  region: string
}) {
  const { apiKey, region } = config
  // baseURL is a placeholder; all actual requests go through the custom fetch interceptor below
  const baseURL = `https://bedrock-runtime.${region}.amazonaws.com/v1/`

  const bedrockHeaders = () => ({
    'authorization': `Bearer ${apiKey}`,
    'content-type': 'application/json',
  })

  return {
    chat: (model: string) => ({
      apiKey,
      baseURL,
      model,
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        // Parse xsai chat request body (messages array + model)
        const body = JSON.parse((init?.body as string) || '{}') as any
        const messages: any[] = body.messages || []
        const modelId: string = body.model || model

        // Separate system messages
        const systemMessages = messages.filter(m => m.role === 'system')
        const chatMessages = messages.filter(m => m.role !== 'system')

        // Convert to Converse messages format
        const converseMessages = mergeConsecutiveRoles(
          chatMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: toConverseContent(m.content),
          })),
        )

        // Build system prompt
        const system = systemMessages.length > 0
          ? systemMessages.map(m => ({
              text: typeof m.content === 'string'
                ? m.content
                : (Array.isArray(m.content) ? m.content.map((c: any) => c.text || '').join('') : String(m.content)),
            }))
          : undefined

        // Build Converse request body
        const converseBody: any = {
          messages: converseMessages,
          inferenceConfig: {
            maxTokens: body.max_tokens || 4096,
            ...(body.temperature !== undefined && { temperature: body.temperature }),
          },
        }
        if (system)
          converseBody.system = system

        // Use /converse (non-streaming) — bearer-token auth does not support
        // the binary event-stream protocol required by /converse-stream.
        // We fetch the complete response and then re-emit it as an SSE stream
        // so the rest of the xsai pipeline sees a standard streaming response.
        const converseUrl = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`

        const response = await fetch(converseUrl, {
          method: 'POST',
          headers: bedrockHeaders(),
          body: JSON.stringify(converseBody),
        })

        if (!response.ok) {
          return response
        }

        const data = await response.json() as {
          output: { message: { content: Array<{ text?: string }> } }
          stopReason?: string
        }

        const fullText = (data.output?.message?.content ?? [])
          .filter(c => c.text)
          .map(c => c.text!)
          .join('')

        const stopReason = data.stopReason === 'end_turn' ? 'stop' : (data.stopReason ?? 'stop')
        const id = `chatcmpl-bedrock-${Date.now()}`
        const encoder = new TextEncoder()

        // Emit the full response as a single SSE chunk (non-streaming Converse API response).
        const stream = new ReadableStream({
          start(controller) {
            const enqueue = (chunk: object) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))

            enqueue({
              id,
              object: 'chat.completion.chunk',
              choices: [{ delta: { role: 'assistant' }, index: 0, finish_reason: null }],
            })

            enqueue({
              id,
              object: 'chat.completion.chunk',
              choices: [{ delta: { content: fullText }, index: 0, finish_reason: null }],
            })

            enqueue({
              id,
              object: 'chat.completion.chunk',
              choices: [{ delta: {}, index: 0, finish_reason: stopReason }],
            })
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          },
        })

        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
          },
        })
      },
    }),
  }
}

export const providerAmazonBedrock = defineProvider<AmazonBedrockConfig>({
  id: 'amazon-bedrock',
  order: 18,
  name: 'Amazon Bedrock',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.amazon-bedrock.title'),
  description: 'aws.amazon.com/bedrock',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.amazon-bedrock.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:aws',
  iconColor: 'i-lobe-icons:aws-color',

  createProviderConfig: ({ t }) => amazonBedrockConfigSchema.extend({
    apiKey: amazonBedrockConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.api-key.placeholder'),
      type: 'password',
    }),
    region: amazonBedrockConfigSchema.shape.region.meta({
      labelLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.region.label'),
      descriptionLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.region.description'),
      placeholderLocalized: 'us-east-1',
    }),
  }),

  onboardingFields: ({ t }) => [
    {
      key: 'apiKey',
      type: 'password' as const,
      label: t('settings.pages.providers.provider.amazon-bedrock.config.api-key.label'),
      description: t('settings.pages.providers.provider.amazon-bedrock.config.api-key.description'),
      placeholder: t('settings.pages.providers.provider.amazon-bedrock.config.api-key.placeholder'),
      required: true,
    },
    {
      key: 'region',
      type: 'text' as const,
      label: t('settings.pages.providers.provider.amazon-bedrock.config.region.label'),
      description: t('settings.pages.providers.provider.amazon-bedrock.config.region.description'),
      placeholder: 'us-east-1',
      defaultValue: 'us-east-1',
    },
  ],

  createProvider(config) {
    const region = config.region
    const baseURL = `https://bedrock-runtime.${region}.amazonaws.com/v1/`
    const chatProvider = createBedrockConverseProvider({
      apiKey: config.apiKey,
      region,
    })
    return merge(
      chatProvider,
      createModelProvider({ apiKey: config.apiKey, baseURL }),
    )
  },

  extraMethods: {
    listModels: async (config, _provider) => {
      const { apiKey, region } = config

      const base = `https://bedrock.${region}.amazonaws.com`
      const headers = {
        authorization: `Bearer ${apiKey}`,
      }

      try {
        // 1. Fetch foundation models for each target provider in parallel
        const targetProviders = ['Amazon', 'Anthropic', 'Moonshot', 'Minimax', 'DeepSeek']
        const foundationResults = await Promise.all(
          targetProviders.map(async (provider) => {
            const url = `${base}/foundation-models?byInferenceType=ON_DEMAND&byOutputModality=TEXT&byProvider=${encodeURIComponent(provider)}`
            const res = await fetch(url, { method: 'GET', headers })
            if (!res.ok)
              return { modelSummaries: [] as any[] }
            return res.json() as Promise<{ modelSummaries: any[] }>
          }),
        )
        const allFoundationModels = foundationResults.flatMap(r => r.modelSummaries || [])

        // 2. Fetch system-defined inference profiles (cross-region, global/us prefixed)
        const profilesRes = await fetch(
          `${base}/inference-profiles?type=SYSTEM_DEFINED&maxResults=1000`,
          { method: 'GET', headers },
        )
        const profilesData = profilesRes.ok
          ? await profilesRes.json() as { inferenceProfileSummaries: any[] }
          : { inferenceProfileSummaries: [] }

        // 3. Build lookup map: baseModelId → { global?: profileId, us?: profileId }
        const profileMap = new Map<string, { global?: string, us?: string }>()
        for (const p of profilesData.inferenceProfileSummaries || []) {
          const id: string = p.inferenceProfileId
          if (!id)
            continue
          const dotIdx = id.indexOf('.')
          if (dotIdx === -1)
            continue
          const prefix = id.slice(0, dotIdx) // 'us' or 'global'
          const baseId = id.slice(dotIdx + 1) // 'amazon.nova-pro-v1:0'

          if (!profileMap.has(baseId))
            profileMap.set(baseId, {})
          const entry = profileMap.get(baseId)!
          if (prefix === 'global')
            entry.global = id
          else if (prefix === 'us')
            entry.us = id
        }

        // 4. For each foundation model, pick best profile ID:
        //    global. > us. > original modelId
        const foundationModelIds = new Set(allFoundationModels.map(m => m.modelId))
        const results: ModelInfo[] = allFoundationModels.map((m) => {
          const entry = profileMap.get(m.modelId)
          const bestId = entry?.global ?? entry?.us ?? m.modelId

          return {
            id: bestId,
            name: m.modelName,
            provider: 'amazon-bedrock',
            description: `${m.providerName} · ${m.modelName}`,
          } satisfies ModelInfo
        })

        // 5. Also include inference profiles for models NOT in the foundation list
        //    (e.g., newer models like Claude Sonnet 4.6, Nova 2 Lite only in profiles)
        const targetPrefixes = ['amazon.', 'anthropic.', 'moonshot.', 'minimax.', 'deepseek.']
        const seenBaseIds = new Set(foundationModelIds)

        for (const p of profilesData.inferenceProfileSummaries || []) {
          const id: string = p.inferenceProfileId
          if (!id)
            continue
          const dotIdx = id.indexOf('.')
          if (dotIdx === -1)
            continue
          const prefix = id.slice(0, dotIdx) // 'us' or 'global'
          const baseId = id.slice(dotIdx + 1) // e.g. 'anthropic.claude-sonnet-4-6:0'

          if (prefix !== 'global' && prefix !== 'us')
            continue
          if (seenBaseIds.has(baseId))
            continue
          if (!targetPrefixes.some(pfx => baseId.startsWith(pfx)))
            continue

          const existing = profileMap.get(baseId)
          if (prefix === 'us' && existing?.global)
            continue

          seenBaseIds.add(baseId)

          const name = p.inferenceProfileName || baseId
          const providerName = baseId.split('.')[0]
          results.push({
            id,
            name,
            provider: 'amazon-bedrock',
            description: `${providerName.charAt(0).toUpperCase() + providerName.slice(1)} · ${name}`,
          } satisfies ModelInfo)
        }

        return results.length > 0 ? results : fallbackModels()
      }
      catch {
        return fallbackModels()
      }
    },
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },

  validators: {
    validateConfig: [],
    validateProvider: [
      () => ({
        id: 'amazon-bedrock:check-credentials',
        name: 'Verify Amazon Bedrock API key',
        validator: async (config: Record<string, any>) => {
          const region = config.region || 'us-east-1'
          const apiKey = config.apiKey
          const errors: Array<{ error: unknown }> = []
          try {
            const res = await fetch(
              `https://bedrock.${region}.amazonaws.com/foundation-models?byInferenceType=ON_DEMAND&byOutputModality=TEXT&byProvider=Amazon&maxResults=1`,
              {
                method: 'GET',
                headers: {
                  authorization: `Bearer ${apiKey}`,
                },
              },
            )
            if (res.status === 403 || res.status === 401) {
              errors.push({ error: new Error('Invalid Amazon Bedrock API key or insufficient permissions.') })
            }
          }
          catch {
            errors.push({ error: new Error('Failed to connect to Amazon Bedrock. Check your region and network.') })
          }
          return {
            errors,
            reason: errors.length > 0 ? (errors[0].error as Error).message : '',
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  },
})
