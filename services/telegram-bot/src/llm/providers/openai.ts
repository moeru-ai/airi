import { env } from 'node:process'
import { createOpenAI } from '@xsai-ext/providers-cloud'

export const openAI = createOpenAI(env.OPENAI_API_KEY!, env.OPENAI_API_BASE_URL!)
