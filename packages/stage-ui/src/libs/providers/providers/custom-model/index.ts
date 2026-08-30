import type { CustomModelConnectionConfig } from '../../custom-model/config'

import { z } from 'zod'

import {
  CUSTOM_MODEL_DEFAULT_PATHS,
  CUSTOM_MODEL_DEFINITION_ID,
  CUSTOM_MODEL_PROTOCOLS,
} from '../../custom-model/config'
import { defineProvider } from '../registry'

const customModelConfigSchema = z.object({
  protocol: z
    .enum(CUSTOM_MODEL_PROTOCOLS)
    .default('openai-chat-completions'),
  baseUrl: z
    .string('Base URL')
    .default(''),
  generationPath: z
    .string('Generation path')
    .default(CUSTOM_MODEL_DEFAULT_PATHS['openai-chat-completions'].generationPath),
  modelListPath: z
    .string('Model list path')
    .optional()
    .default(CUSTOM_MODEL_DEFAULT_PATHS['openai-chat-completions'].modelListPath),
  auth: z.object({
    type: z.enum(['bearer', 'x-api-key', 'none']).default('bearer'),
    secret: z.string().optional(),
  }).default({ type: 'bearer' }),
  headers: z.record(z.string(), z.string()).default({}),
  models: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
  })).default([]),
  protocolOptions: z.object({
    anthropicVersion: z.string().optional(),
  }).optional(),
})

/**
 * Registers the local-only Custom Model connection definition.
 *
 * Generation runtime is owned by the protocol adapters. This factory only
 * describes configuration, storage, and catalog identity.
 */
export const providerCustomModel = defineProvider<CustomModelConnectionConfig>({
  id: CUSTOM_MODEL_DEFINITION_ID,
  order: 3,
  name: 'Custom Model',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.custom-model.title'),
  description: 'User-managed model service connection.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.custom-model.description'),
  tasks: ['chat'],
  icon: 'i-solar:server-square-linear',
  configStorage: 'local',
  disableChatPingCheckUI: true,

  createProviderConfig: ({ t }) => customModelConfigSchema.extend({
    protocol: customModelConfigSchema.shape.protocol.meta({
      labelLocalized: t('settings.pages.providers.provider.custom-model.fields.protocol.label'),
      type: 'select',
      options: [
        {
          label: t('settings.pages.providers.provider.custom-model.fields.protocol.options.openai-chat-completions'),
          value: 'openai-chat-completions',
        },
        {
          label: t('settings.pages.providers.provider.custom-model.fields.protocol.options.openai-responses'),
          value: 'openai-responses',
        },
        {
          label: t('settings.pages.providers.provider.custom-model.fields.protocol.options.anthropic-messages'),
          value: 'anthropic-messages',
        },
      ],
    }),
    baseUrl: customModelConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),

  createProvider() {
    throw new Error('Custom Model generation uses the protocol runtime.')
  },
})
