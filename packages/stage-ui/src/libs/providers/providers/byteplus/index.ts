import { createArkChatProviderDefinition } from '../ark-shared'

export const providerBytePlus = createArkChatProviderDefinition({
  defaultBaseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3',
  description: 'BytePlus',
  descriptionKey: 'settings.pages.providers.provider.byteplus.description',
  icon: 'i-lobe-icons:bytedance',
  iconColor: 'i-lobe-icons:bytedance-color',
  id: 'byteplus',
  modelPrefix: 'byteplus/',
  models: [
    { contextLength: 256000, id: 'seed-2-0-pro-260328' },
    { contextLength: 256000, id: 'seed-2-0-lite-260228' },
    { contextLength: 256000, id: 'seed-2-0-mini-260215' },
    { contextLength: 256000, id: 'kimi-k2-5-260127' },
    { contextLength: 200000, id: 'glm-4-7-251222' },
  ],
  name: 'BytePlus',
  nameKey: 'settings.pages.providers.provider.byteplus.title',
  order: 8,
})
