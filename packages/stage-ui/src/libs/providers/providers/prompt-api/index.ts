import { createChatProvider } from 'xsai-chromium-prompt'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const openAICompatibleConfigSchema = z.object({
  apiKey: z
    .string('API Key')
    .optional(),
  baseUrl: z
    .string('Base URL')
    .optional(),
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
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity],
    }),
  },
})
