import type { ModelInfo } from '../../types'

import { createChatProvider, createModelProvider, merge } from '@xsai-ext/providers/utils'
import { AwsClient } from 'aws4fetch'
import { z } from 'zod'

import { defineProvider } from '../registry'

const amazonBedrockConfigSchema = z.object({
  region: z
    .string()
    .default('us-east-1'),
  accessKeyId: z
    .string(),
  secretAccessKey: z
    .string(),
  sessionToken: z
    .string()
    .optional(),
})

type AmazonBedrockConfig = z.input<typeof amazonBedrockConfigSchema>

function createAmazonBedrock(config: AmazonBedrockConfig) {
  const region = config.region || 'us-east-1'
  const baseURL = `https://bedrock-runtime.${region}.amazonaws.com/v1/`

  const awsClient = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken,
    region,
    service: 'bedrock',
  })

  const bedrockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url
    return awsClient.fetch(url, init as RequestInit)
  }

  return merge(
    createChatProvider({ apiKey: 'aws-sigv4', baseURL, fetch: bedrockFetch as typeof fetch }),
    createModelProvider({ apiKey: 'aws-sigv4', baseURL, fetch: bedrockFetch as typeof fetch }),
  )
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
    region: amazonBedrockConfigSchema.shape.region.meta({
      labelLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.region.label'),
      descriptionLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.region.description'),
      placeholderLocalized: 'us-east-1',
    }),
    accessKeyId: amazonBedrockConfigSchema.shape.accessKeyId.meta({
      labelLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.access-key-id.label'),
      descriptionLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.access-key-id.description'),
      placeholderLocalized: 'AKIAIOSFODNN7EXAMPLE',
      type: 'password',
    }),
    secretAccessKey: amazonBedrockConfigSchema.shape.secretAccessKey.meta({
      labelLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.secret-access-key.label'),
      descriptionLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.secret-access-key.description'),
      placeholderLocalized: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      type: 'password',
    }),
    sessionToken: amazonBedrockConfigSchema.shape.sessionToken.meta({
      labelLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.session-token.label'),
      descriptionLocalized: t('settings.pages.providers.provider.amazon-bedrock.config.session-token.description'),
      placeholderLocalized: '',
      type: 'password',
      section: 'advanced',
    }),
  }),

  createProvider(config) {
    return createAmazonBedrock(config)
  },

  extraMethods: {
    listModels: async () => ([
      {
        id: 'us.anthropic.claude-opus-4-5-20250514-v1:0',
        name: 'Claude Opus 4.5 (Bedrock)',
        provider: 'amazon-bedrock',
        description: 'Most capable Claude model on Amazon Bedrock',
      },
      {
        id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        name: 'Claude Sonnet 4.5 (Bedrock)',
        provider: 'amazon-bedrock',
        description: 'Best balance of intelligence and speed on Amazon Bedrock',
      },
      {
        id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        name: 'Claude Haiku 4.5 (Bedrock)',
        provider: 'amazon-bedrock',
        description: 'Fastest Claude model on Amazon Bedrock',
      },
      {
        id: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        name: 'Claude Sonnet 3.7 (Bedrock)',
        provider: 'amazon-bedrock',
        description: 'Hybrid reasoning model on Amazon Bedrock',
      },
      {
        id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
        name: 'Claude Sonnet 3.5 v2 (Bedrock)',
        provider: 'amazon-bedrock',
        description: 'Intelligent, fast Claude 3.5 model on Amazon Bedrock',
      },
      {
        id: 'us.amazon.nova-pro-v1:0',
        name: 'Amazon Nova Pro',
        provider: 'amazon-bedrock',
        description: 'Amazon Nova highly capable multimodal model',
      },
      {
        id: 'us.amazon.nova-lite-v1:0',
        name: 'Amazon Nova Lite',
        provider: 'amazon-bedrock',
        description: 'Amazon Nova very low cost multimodal model',
      },
      {
        id: 'us.amazon.nova-micro-v1:0',
        name: 'Amazon Nova Micro',
        provider: 'amazon-bedrock',
        description: 'Amazon Nova text only model, lowest cost',
      },
      {
        id: 'us.meta.llama3-3-70b-instruct-v1:0',
        name: 'Llama 3.3 70B Instruct (Bedrock)',
        provider: 'amazon-bedrock',
        description: 'Meta Llama 3.3 70B on Amazon Bedrock',
      },
    ] satisfies ModelInfo[]),
  },

  validationRequiredWhen(config) {
    return !!config.accessKeyId?.trim() && !!config.secretAccessKey?.trim()
  },

  validators: {
    validateConfig: [],
    validateProvider: [],
  },
})
