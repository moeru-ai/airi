import { errorMessageFrom } from '@moeru/std'
import { checkPromptAvailability, createChatProvider } from 'xsai-chromium-prompt'
import { z } from 'zod'

import { defineProvider } from '../registry'

const openAICompatibleConfigSchema = z.object({
  apiKey: z
    .string('API Key')
    .optional(),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('http://localhost:5173/settings/providers/chat/prompt-api'),
})

type OpenAICompatibleConfig = z.input<typeof openAICompatibleConfigSchema>

export const providerPromptAPICompatible = defineProvider<OpenAICompatibleConfig>({
  id: 'prompt-api',
  name: 'Prompt API',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.prompt-api.title'),
  description: 'With the Prompt API, you can send natural language requests to the foundation model in Chrome.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.prompt-api.description'),
  tasks: ['chat'],
  icon: 'i-simple-icons:googlechrome',
  iconColor: 'i-logos:chrome',

  createProviderConfig: () => openAICompatibleConfigSchema,
  createProvider() {
    return createChatProvider()
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'prompt-api:check-availability',
        name: t('settings.pages.providers.catalog.edit.validators.prompt-api.check-availability.title'),
        schedule: {
          mode: 'interval',
          intervalMs: 15_000,
        },
        validator: async () => {
          const errors: Array<{ error: unknown }> = []
          let reason = ''
          try {
            const availability = await checkPromptAvailability()
            switch (availability) {
              case 'available':
                break
              case 'downloadable':
                reason = 'The model is downloadable'
                errors.push({ error: new Error(reason) })
                break
              case 'downloading':
                reason = 'The model is downloading'
                errors.push({ error: new Error(reason) })
                break
              case 'unavailable':
                reason = 'The Prompt API is unavailable'
                errors.push({ error: new Error(reason) })
                break
            }
          }
          catch (e) {
            const errorMessage = errorMessageFrom(e) || 'Unknown error.'
            const reason = `Connectivity check failed: ${errorMessage}`
            errors.push({ error: new Error(reason) })
          }
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
