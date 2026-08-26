import { createWorkersAI } from '@xsai-ext/providers/special/create'
import { z } from 'zod'

import { defineProvider } from '../registry'

export const providerCloudflareWorkersAI = defineProvider<{ accountId: string, apiKey: string }>({
  createProvider(config) {
    return createWorkersAI(config.apiKey, config.accountId)
  },
  createProviderConfig: ({ t }) => z.object({
    accountId: z.string().meta({
      descriptionLocalized: t('settings.pages.providers.provider.cloudflare-workers-ai.fields.field.account-id.description'),
      labelLocalized: t('settings.pages.providers.provider.cloudflare-workers-ai.fields.field.account-id.label'),
      placeholderLocalized: t('settings.pages.providers.provider.cloudflare-workers-ai.fields.field.account-id.placeholder'),
    }),
    apiKey: z.string().meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.provider.cloudflare-workers-ai.fields.field.api-key.placeholder'),
      type: 'password',
    }),
  }),
  description: 'Cloudflare Workers AI with account-scoped credentials.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.cloudflare-workers-ai.description'),
  icon: 'i-simple-icons:cloudflare',
  iconColor: 'i-lobe-icons:cloudflare-color',
  id: 'cloudflare-workers-ai',
  name: 'Cloudflare Workers AI',

  nameLocalize: ({ t }) => t('settings.pages.providers.provider.cloudflare-workers-ai.title'),
  tasks: ['chat'],
  validationRequiredWhen: (config) => {
    return !!config.apiKey && !!config.accountId
  },
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'cloudflare-workers-ai:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const errors: Array<{ error: unknown }> = []
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const accountId = typeof config.accountId === 'string' ? config.accountId.trim() : ''

          if (!apiKey)
            errors.push({ error: new Error('API token is required.') })
          if (!accountId)
            errors.push({ error: new Error('Account ID is required.') })

          return {
            errors,
            reason: errors.length > 0 ? errors.map(item => (item.error as Error).message).join(', ') : '',
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  },
})
