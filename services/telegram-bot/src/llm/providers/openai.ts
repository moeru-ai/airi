import { env } from 'node:process'
import { createOpenAI } from '@xsai/providers'

export const openAI = createOpenAI({
  baseURL: env.OPENAI_API_BASE_URL!,
  apiKey: env.OPENAI_API_KEY!,
})
